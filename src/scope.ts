/**
 * Scope analysis for Ember ESTree ASTs.
 *
 * Provides eslint-scope–compatible scope tracking that understands both
 * standard ESTree (JS/TS) nodes and Glimmer template nodes. Tracks
 * variable definitions, references, and resolution across the JS ↔ Glimmer
 * boundary. Optionally auto-invalidates when the AST is mutated via Proxy
 * observation.
 */

import { glimmerVisitorKeys } from "ember-estree";

// ── Constants ────────────────────────────────────────────────────────────

const READ = 1;
const WRITE = 2;
const RW = 3;

/** Glimmer built-in keywords that should not create variable references. */
const GLIMMER_KEYWORDS = new Set([
  "if",
  "else",
  "yield",
  "outlet",
  "has-block",
  "has-block-params",
  "let",
  "each",
  "each-in",
  "component",
  "helper",
  "modifier",
  "debugger",
  "log",
  "fn",
  "hash",
  "array",
  "concat",
  "get",
  "on",
  "unique-id",
  "in-element",
  "unless",
  "not",
  "and",
  "or",
]);

// ── Core Classes ─────────────────────────────────────────────────────────

export class Definition {
  type: string;
  name: any;
  node: any;
  parent: any;
  index: number | null;

  constructor(type: string, name: any, node: any, parent: any, index: number | null = null) {
    this.type = type;
    this.name = name;
    this.node = node;
    this.parent = parent;
    this.index = index;
  }
}

export class Variable {
  name: string;
  scope: Scope;
  defs: Definition[] = [];
  references: Reference[] = [];
  identifiers: any[] = [];

  constructor(name: string, scope: Scope) {
    this.name = name;
    this.scope = scope;
  }
}

export class Reference {
  identifier: any;
  scope: Scope;
  resolved: Variable | null = null;
  flag: number;

  constructor(identifier: any, scope: Scope, flag: number = READ) {
    this.identifier = identifier;
    this.scope = scope;
    this.flag = flag;
  }

  get from(): Scope {
    return this.scope;
  }

  isRead(): boolean {
    return (this.flag & READ) !== 0;
  }

  isWrite(): boolean {
    return (this.flag & WRITE) !== 0;
  }

  isReadWrite(): boolean {
    return this.flag === RW;
  }
}

export class Scope {
  type: string;
  block: any;
  upper: Scope | null;
  childScopes: Scope[] = [];
  variables: Variable[] = [];
  references: Reference[] = [];
  through: Reference[] = [];
  set: Map<string, Variable> = new Map();
  isStrict: boolean;

  constructor(type: string, block: any, upper: Scope | null, isStrict: boolean = false) {
    this.type = type;
    this.block = block;
    this.upper = upper;
    this.isStrict = isStrict || (upper?.isStrict ?? false);
    if (upper) {
      upper.childScopes.push(this);
    }
  }
}

export class ScopeManager {
  scopes: Scope[] = [];
  _globalScope!: Scope;

  private _nodeToScope = new WeakMap<any, Scope>();
  private _innerNodeToScope = new WeakMap<any, Scope>();
  private _declaredVars = new WeakMap<any, Variable[]>();
  private _dirty = false;
  private _ast: any;
  private _options: AnalyzeOptions;
  private _proxies: Array<{ revoke: () => void; owner: any; key: string; original: any[] }> = [];

  constructor(ast: any, options: AnalyzeOptions) {
    this._ast = ast;
    this._options = options;
  }

  get globalScope(): Scope {
    this._ensureFresh();
    return this._globalScope;
  }

  set globalScope(scope: Scope) {
    this._globalScope = scope;
  }

  acquire(node: any, inner?: boolean): Scope | null {
    this._ensureFresh();
    if (inner) {
      return this._innerNodeToScope.get(node) ?? this._nodeToScope.get(node) ?? null;
    }
    return this._nodeToScope.get(node) ?? null;
  }

  getDeclaredVariables(node: any): Variable[] {
    this._ensureFresh();
    return this._declaredVars.get(node) ?? [];
  }

  /** Mark the scope data as stale. Next query triggers re-analysis. */
  invalidate(): void {
    this._dirty = true;
  }

  /** Force re-analysis now. Returns this manager (mutated in place). */
  refresh(): ScopeManager {
    this._revokeProxies();
    runAnalysis(this, this._ast, this._options);
    this._observe(this._ast);
    this._dirty = false;
    return this;
  }

  /** Disconnect all Proxy observers and release resources. */
  destroy(): void {
    this._revokeProxies();
    this._dirty = false;
  }

  // ── Internal ──

  _ensureFresh(): void {
    if (this._dirty) {
      this.refresh();
    }
  }

  _registerScope(scope: Scope, node: any): void {
    this.scopes.push(scope);
    this._nodeToScope.set(node, scope);
  }

  _registerInnerScope(node: any, scope: Scope): void {
    this._innerNodeToScope.set(node, scope);
  }

  _addDeclaredVar(node: any, variable: Variable): void {
    const existing = this._declaredVars.get(node);
    if (existing) {
      existing.push(variable);
    } else {
      this._declaredVars.set(node, [variable]);
    }
  }

  _observe(ast: any): void {
    const visited = new Set<any>();
    const visitorKeys = this._resolveVisitorKeys();
    this._walkAndProxy(ast, visited, visitorKeys);
  }

  private _walkAndProxy(node: any, visited: Set<any>, visitorKeys: Record<string, string[]>): void {
    if (!node || typeof node !== "object" || visited.has(node)) return;
    visited.add(node);

    const keys = node.type ? (visitorKeys[node.type] ?? Object.keys(node)) : Object.keys(node);
    for (const key of keys) {
      if (
        key === "parent" ||
        key === "loc" ||
        key === "range" ||
        key === "tokens" ||
        key === "comments"
      )
        continue;
      const child = node[key];
      if (Array.isArray(child)) {
        const proxy = this._wrapArray(node, key, child);
        if (proxy) {
          node[key] = proxy;
        }
        for (const item of child) {
          if (item && typeof item === "object") {
            this._walkAndProxy(item, visited, visitorKeys);
          }
        }
      } else if (child && typeof child === "object" && child.type) {
        this._walkAndProxy(child, visited, visitorKeys);
      }
    }
  }

  private _wrapArray(owner: any, key: string, arr: any[]): any[] | null {
    const invalidate = () => {
      this._dirty = true;
    };
    const { proxy, revoke } = Proxy.revocable(arr, {
      set(target, prop, value) {
        const result = Reflect.set(target, prop, value);
        if (typeof prop === "string" && prop !== "length") {
          invalidate();
        }
        return result;
      },
      deleteProperty(target, prop) {
        const result = Reflect.deleteProperty(target, prop);
        invalidate();
        return result;
      },
    });
    this._proxies.push({ revoke, owner, key, original: arr });
    return proxy;
  }

  private _revokeProxies(): void {
    for (const p of this._proxies) {
      try {
        // Restore original array before revoking so the AST isn't left
        // with a dead proxy reference.
        p.owner[p.key] = p.original;
        p.revoke();
      } catch {
        /* already revoked or owner changed */
      }
    }
    this._proxies = [];
  }

  private _resolveVisitorKeys(): Record<string, string[]> {
    const custom = this._options.visitorKeys ?? {};
    const astKeys = this._ast?.visitorKeys ?? {};
    return { ...astKeys, ...glimmerVisitorKeys, ...custom };
  }
}

// ── Analysis Options ─────────────────────────────────────────────────────

export interface AnalyzeOptions {
  sourceType?: "module" | "script";
  visitorKeys?: Record<string, string[]>;
}

// ── Analyzer ─────────────────────────────────────────────────────────────

/**
 * Analyze an AST and return a ScopeManager with full scope information.
 */
export function analyze(ast: any, options: AnalyzeOptions = {}): ScopeManager {
  const manager = new ScopeManager(ast, options);
  runAnalysis(manager, ast, options);
  manager._observe(ast);
  return manager;
}

function runAnalysis(manager: ScopeManager, ast: any, options: AnalyzeOptions): void {
  // Reset
  manager.scopes = [];
  // WeakMaps don't need clearing — stale entries are unreachable

  const sourceType = options.sourceType ?? "module";
  const visitorKeys: Record<string, string[]> = {
    ...ast.visitorKeys,
    ...glimmerVisitorKeys,
    ...options.visitorKeys,
  };

  let currentScope: Scope;
  const pendingRefs: Array<{ ref: Reference; scope: Scope }> = [];

  // ── Scope helpers ──

  function pushScope(type: string, node: any): Scope {
    const scope = new Scope(type, node, currentScope, currentScope?.isStrict);
    manager._registerScope(scope, node);
    currentScope = scope;
    return scope;
  }

  function popScope(): void {
    // Propagate unresolved references up
    const scope = currentScope;
    for (const ref of scope.through) {
      if (scope.upper) {
        scope.upper.through.push(ref);
      }
    }
    currentScope = scope.upper!;
  }

  function defineVariable(
    name: string,
    identifierNode: any,
    defType: string,
    declarationNode: any,
    parentNode: any,
    scope: Scope,
    index: number | null = null,
  ): Variable {
    let variable = scope.set.get(name);
    if (!variable) {
      variable = new Variable(name, scope);
      scope.variables.push(variable);
      scope.set.set(name, variable);
    }
    const def = new Definition(defType, identifierNode, declarationNode, parentNode, index);
    variable.defs.push(def);
    variable.identifiers.push(identifierNode);
    manager._addDeclaredVar(declarationNode, variable);
    return variable;
  }

  function addReference(identifierNode: any, scope: Scope, flag: number = READ): Reference {
    const ref = new Reference(identifierNode, scope, flag);
    scope.references.push(ref);
    pendingRefs.push({ ref, scope });
    return ref;
  }

  function findFunctionScope(scope: Scope): Scope {
    let s: Scope | null = scope;
    while (s) {
      if (s.type === "function" || s.type === "module" || s.type === "global") return s;
      s = s.upper;
    }
    return scope;
  }

  // ── Pattern destructuring ──

  function collectPatternIds(
    pattern: any,
    defType: string,
    declarationNode: any,
    parentNode: any,
    scope: Scope,
    startIndex: number,
  ): void {
    if (!pattern) return;
    switch (pattern.type) {
      case "Identifier":
        defineVariable(
          pattern.name,
          pattern,
          defType,
          declarationNode,
          parentNode,
          scope,
          startIndex,
        );
        break;
      case "ObjectPattern":
        for (const prop of pattern.properties ?? []) {
          if (prop.type === "RestElement") {
            collectPatternIds(
              prop.argument,
              defType,
              declarationNode,
              parentNode,
              scope,
              startIndex,
            );
          } else {
            collectPatternIds(
              prop.value ?? prop,
              defType,
              declarationNode,
              parentNode,
              scope,
              startIndex,
            );
          }
        }
        break;
      case "ArrayPattern":
        for (let i = 0; i < (pattern.elements?.length ?? 0); i++) {
          const el = pattern.elements[i];
          if (el)
            collectPatternIds(el, defType, declarationNode, parentNode, scope, startIndex + i);
        }
        break;
      case "RestElement":
        collectPatternIds(
          pattern.argument,
          defType,
          declarationNode,
          parentNode,
          scope,
          startIndex,
        );
        break;
      case "AssignmentPattern":
        collectPatternIds(pattern.left, defType, declarationNode, parentNode, scope, startIndex);
        // The right side contains references, handled during normal traversal
        break;
    }
  }

  // ── Identifier role detection ──

  function shouldSkipIdentifier(node: any, parent: any, parentKey: string | null): boolean {
    if (!parent || !parentKey) return false;

    // Property access: obj.prop (non-computed)
    if (parent.type === "MemberExpression" && parentKey === "property" && !parent.computed)
      return true;

    // Object property key (non-computed, non-shorthand)
    if (parent.type === "Property" && parentKey === "key" && !parent.computed && !parent.shorthand)
      return true;

    // Method/property definition key
    if (
      (parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") &&
      parentKey === "key" &&
      !parent.computed
    )
      return true;

    // Import specifiers — the "imported" name, not the local binding
    if (parent.type === "ImportSpecifier" && parentKey === "imported") return true;

    // Export specifiers
    if (parent.type === "ExportSpecifier" && parentKey === "exported") return true;

    // Labels
    if (
      (parent.type === "LabeledStatement" ||
        parent.type === "BreakStatement" ||
        parent.type === "ContinueStatement") &&
      parentKey === "label"
    )
      return true;

    // Function/class name declarations are handled separately
    if (
      (parent.type === "FunctionDeclaration" ||
        parent.type === "FunctionExpression" ||
        parent.type === "ClassDeclaration" ||
        parent.type === "ClassExpression") &&
      parentKey === "id"
    )
      return true;

    // Variable declarator id — handled by declaration logic
    if (parent.type === "VariableDeclarator" && parentKey === "id") return true;

    // Catch clause param
    if (parent.type === "CatchClause" && parentKey === "param") return true;

    // Function params
    if (
      (parent.type === "FunctionDeclaration" ||
        parent.type === "FunctionExpression" ||
        parent.type === "ArrowFunctionExpression") &&
      parentKey === "params"
    )
      return true;

    // Import local bindings are handled separately
    if (
      (parent.type === "ImportSpecifier" ||
        parent.type === "ImportDefaultSpecifier" ||
        parent.type === "ImportNamespaceSpecifier") &&
      parentKey === "local"
    )
      return true;

    // Type annotations — skip TS type-only nodes
    if (parent.type?.startsWith("TS") && parentKey !== "init") return true;

    return false;
  }

  // ── Scope-creating node detection ──

  const FUNCTION_TYPES = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
  ]);

  const BLOCK_SCOPE_PARENTS = new Set([
    "ForStatement",
    "ForInStatement",
    "ForOfStatement",
    "SwitchStatement",
  ]);

  // ── Main walk ──

  function visit(node: any, parent: any, parentKey: string | null): void {
    if (!node || typeof node !== "object" || !node.type) return;

    let scopePushed = false;
    const nodeType = node.type;

    // ── Program ──
    if (nodeType === "Program" || nodeType === "File") {
      const programNode = nodeType === "File" ? node.program : node;
      if (programNode && programNode !== node) {
        // File wraps Program — create scope on Program
        visit(programNode, node, "program");
        return;
      }
      const scopeType = sourceType === "module" ? "module" : "global";
      const scope = new Scope(scopeType, node, null, sourceType === "module");
      manager._registerScope(scope, node);
      manager.globalScope = scope;
      currentScope = scope;
      scopePushed = true;
    }

    // ── Functions ──
    else if (FUNCTION_TYPES.has(nodeType)) {
      // Function name goes in the outer scope
      if (nodeType === "FunctionDeclaration" && node.id?.name) {
        defineVariable(node.id.name, node.id, "FunctionName", node, parent, currentScope);
      }

      const funcScope = pushScope("function", node);
      manager._registerInnerScope(node, funcScope);
      scopePushed = true;

      // FunctionExpression name is only visible inside itself
      if (nodeType === "FunctionExpression" && node.id?.name) {
        defineVariable(node.id.name, node.id, "FunctionName", node, node, funcScope);
      }

      // Parameters
      const params = node.params ?? [];
      for (let i = 0; i < params.length; i++) {
        collectPatternIds(params[i], "Parameter", node, node, funcScope, i);
      }
    }

    // ── Class ──
    else if (nodeType === "ClassDeclaration" || nodeType === "ClassExpression") {
      if (nodeType === "ClassDeclaration" && node.id?.name) {
        defineVariable(node.id.name, node.id, "ClassName", node, parent, currentScope);
      }
      const classScope = pushScope("class", node);
      manager._registerInnerScope(node, classScope);
      scopePushed = true;

      if (nodeType === "ClassExpression" && node.id?.name) {
        defineVariable(node.id.name, node.id, "ClassName", node, node, classScope);
      }
    }

    // ── Block scope ──
    else if (nodeType === "BlockStatement" && parent && !FUNCTION_TYPES.has(parent.type)) {
      pushScope("block", node);
      scopePushed = true;
    }

    // ── For loops ──
    else if (BLOCK_SCOPE_PARENTS.has(nodeType)) {
      pushScope("block", node);
      scopePushed = true;
    }

    // ── Catch clause ──
    else if (nodeType === "CatchClause") {
      pushScope("block", node);
      scopePushed = true;
      if (node.param) {
        collectPatternIds(node.param, "Parameter", node, node, currentScope, 0);
      }
    }

    // ── Variable declarations ──
    else if (nodeType === "VariableDeclaration") {
      const kind = node.kind;
      const targetScope = kind === "var" ? findFunctionScope(currentScope) : currentScope;
      for (const decl of node.declarations ?? []) {
        if (decl.type === "VariableDeclarator" && decl.id) {
          collectPatternIds(decl.id, "Variable", decl, node, targetScope, 0);
        }
      }
    }

    // ── Import declarations ──
    else if (nodeType === "ImportDeclaration") {
      const moduleScope = findModuleScope();
      for (const spec of node.specifiers ?? []) {
        if (spec.local?.name) {
          defineVariable(spec.local.name, spec.local, "ImportBinding", spec, node, moduleScope);
        }
      }
    }

    // ── Identifiers (references) ──
    else if (nodeType === "Identifier") {
      if (!shouldSkipIdentifier(node, parent, parentKey)) {
        const flag = getIdentifierFlag(node, parent, parentKey);
        addReference(node, currentScope, flag);
      }
    }

    // ── Assignment targets (write references for patterns) ──
    else if (nodeType === "AssignmentExpression") {
      // Left side handled during child traversal (Identifier case with write flag)
    }

    // ── Glimmer: block params create a new scope ──
    else if (node.blockParamNodes?.length > 0 && nodeType.startsWith("Glimmer")) {
      const glimmerScope = pushScope("glimmer-block", node);
      manager._registerInnerScope(node, glimmerScope);
      scopePushed = true;
      for (let i = 0; i < node.blockParamNodes.length; i++) {
        const bp = node.blockParamNodes[i];
        defineVariable(bp.name, bp, "BlockParam", node, node, glimmerScope, i);
      }
    }

    // ── Glimmer: path expression references ──
    if (nodeType === "GlimmerPathExpression" && node.head?.type === "VarHead") {
      const name = node.head.name;
      if (name && !GLIMMER_KEYWORDS.has(name)) {
        addReference(node.head, currentScope, READ);
      }
    }

    // ── Glimmer: component element references ──
    if (nodeType === "GlimmerElementNode" && node.parts?.[0]) {
      const part = node.parts[0];
      const name = part.name;
      if (
        name &&
        name !== "this" &&
        !name.startsWith(":") &&
        !name.startsWith("@") &&
        !name.includes("-") &&
        /^[A-Z]/.test(name)
      ) {
        addReference(part, currentScope, READ);
      }
    }

    // ── Recurse into children ──
    const keys = visitorKeys[nodeType];
    if (keys) {
      for (const key of keys) {
        const child = node[key];
        if (!child) continue;
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === "object" && item.type) {
              visit(item, node, key);
            }
          }
        } else if (typeof child === "object" && child.type) {
          visit(child, node, key);
        }
      }
    } else if (nodeType !== "File") {
      // Fallback: walk all keys for unknown node types
      for (const key of Object.keys(node)) {
        if (
          key === "parent" ||
          key === "loc" ||
          key === "range" ||
          key === "tokens" ||
          key === "comments"
        )
          continue;
        const child = node[key];
        if (!child || typeof child !== "object") continue;
        if (Array.isArray(child)) {
          for (const item of child) {
            if (item && typeof item === "object" && item.type) {
              visit(item, node, key);
            }
          }
        } else if (child.type) {
          visit(child, node, key);
        }
      }
    }

    // ── Pop scope ──
    if (scopePushed) {
      popScope();
    }
  }

  function findModuleScope(): Scope {
    let s: Scope | null = currentScope;
    while (s) {
      if (s.type === "module" || s.type === "global") return s;
      s = s.upper;
    }
    return currentScope;
  }

  function getIdentifierFlag(_node: any, parent: any, parentKey: string | null): number {
    if (!parent) return READ;

    // Assignment left-hand side
    if (parent.type === "AssignmentExpression" && parentKey === "left") return WRITE;

    // Update expression
    if (parent.type === "UpdateExpression" && parentKey === "argument") return RW;

    // For-in/for-of left
    if (
      (parent.type === "ForInStatement" || parent.type === "ForOfStatement") &&
      parentKey === "left"
    )
      return WRITE;

    return READ;
  }

  // ── Run ──
  visit(ast, null, null);

  // ── Resolve references ──
  for (const { ref, scope } of pendingRefs) {
    let s: Scope | null = scope;
    let resolved = false;
    while (s) {
      const variable = s.set.get(ref.identifier.name ?? ref.identifier.original);
      if (variable) {
        ref.resolved = variable;
        variable.references.push(ref);
        resolved = true;
        break;
      }
      s = s.upper;
    }
    if (!resolved) {
      // Add to through chain — already in scope.references
      scope.through.push(ref);
    }
  }
}
