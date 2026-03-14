import { createRequire } from "module";
import type { Parser, ParseOptions } from "zmod";

const require = createRequire(import.meta.url);

interface ParseForESLintResult {
  ast: any;
  visitorKeys: Record<string, string[]>;
  scopeManager: any;
  services: any;
  isTypescript?: boolean;
}

interface EmberParserModule {
  parseForESLint(code: string, options: Record<string, any>): ParseForESLintResult;
}

/**
 * Walk the AST and:
 * 1. Ensure all nodes have `start` and `end` byte-offset properties
 *    (zmod requires these for span-based patching).
 * 2. Remove `parent` back-references from Glimmer nodes to prevent
 *    infinite recursion in zmod's tree traversal (`buildPaths`).
 *
 * ember-eslint-parser produces Glimmer AST nodes with `parent`
 * properties that point back up the tree, and shared `tokens` arrays
 * that create circular references. zmod's `buildPaths` iterates
 * `Object.keys(node)` and recurses into any value with a `type`
 * property, so these must be removed.
 */
function prepareAst(node: any, visited: Set<any> = new Set()): void {
  if (!node || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);

  if (node.type) {
    // Copy range to start/end if missing
    if (Array.isArray(node.range) && node.range.length === 2) {
      if (typeof node.start !== "number") node.start = node.range[0];
      if (typeof node.end !== "number") node.end = node.range[1];
    }

    // Remove circular parent references (Glimmer nodes)
    if ("parent" in node && node.parent && typeof node.parent === "object") {
      delete node.parent;
    }
  }

  const keys = Object.keys(node);
  for (const key of keys) {
    // Skip known non-child properties
    if (key === "parent" || key === "loc") continue;

    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object") {
          prepareAst(item, visited);
        }
      }
    } else if (val && typeof val === "object" && val.type) {
      prepareAst(val, visited);
    }
  }
}

class EmberParserAdapter implements Parser {
  #parserModule: EmberParserModule;

  constructor() {
    this.#parserModule = require("ember-eslint-parser") as EmberParserModule;
  }

  /**
   * Parse Ember .gjs/.gts source code into an ESTree-compatible AST
   * with embedded Glimmer template nodes.
   *
   * All nodes in the returned AST are guaranteed to have numeric
   * `start` and `end` byte-offset properties (where available from
   * the underlying parser).
   */
  parse(source: string, options?: ParseOptions): any {
    const filePath = (options as any)?.filePath ?? "file.gjs";

    const result = this.#parserModule.parseForESLint(source, {
      ...options,
      filePath,
      ranges: true,
    });

    const ast = result.ast;

    // Prepare the AST for zmod: ensure start/end and remove circular refs
    prepareAst(ast);

    // Attach visitor keys so zmod can traverse Glimmer nodes
    (ast as any).__visitorKeys = result.visitorKeys;

    return ast;
  }

  /**
   * Serialize an AST node back to source code.
   *
   * For most transformations zmod uses span-based patching (preserving
   * the original source for unchanged regions), so this method is only
   * called for builder-created nodes that lack `start`/`end` spans.
   */
  print(node: any): string {
    return printNode(node);
  }
}

/**
 * Minimal recursive AST printer that handles common ESTree node types
 * and Glimmer template nodes.
 *
 * This is intentionally simple — zmod's span-based patching means the
 * printer is only invoked for newly-created AST nodes (via builders).
 */
function printNode(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;

  switch (node.type) {
    // ── Identifiers & Literals ────────────────────────────────────
    case "Identifier":
      return node.name;

    case "Literal":
    case "StringLiteral":
      if (typeof node.value === "string") {
        const quote = node.extra?.raw?.[0] ?? '"';
        return `${quote}${node.value}${quote}`;
      }
      return String(node.value);

    case "NumericLiteral":
      return String(node.value);

    case "BooleanLiteral":
      return String(node.value);

    case "NullLiteral":
      return "null";

    case "RegExpLiteral":
      return `/${node.pattern}/${node.flags ?? ""}`;

    case "TemplateLiteral": {
      const quasis = node.quasis ?? [];
      const exprs = node.expressions ?? [];
      let result = "`";
      for (let i = 0; i < quasis.length; i++) {
        result += quasis[i].value?.raw ?? quasis[i].value?.cooked ?? "";
        if (i < exprs.length) {
          result += "${" + printNode(exprs[i]) + "}";
        }
      }
      return result + "`";
    }

    case "TemplateElement":
      return node.value?.raw ?? "";

    // ── Expressions ────────────────────────────────────────────────
    case "CallExpression":
    case "OptionalCallExpression": {
      const callee = printNode(node.callee);
      const args = (node.arguments ?? []).map(printNode).join(", ");
      const opt = node.optional ? "?." : "";
      return `${callee}${opt}(${args})`;
    }

    case "MemberExpression":
    case "OptionalMemberExpression": {
      const obj = printNode(node.object);
      const prop = printNode(node.property);
      if (node.computed) return `${obj}[${prop}]`;
      const opt = node.optional ? "?." : ".";
      return `${obj}${opt}${prop}`;
    }

    case "ArrowFunctionExpression": {
      const params = (node.params ?? []).map(printNode).join(", ");
      const body = printNode(node.body);
      const async = node.async ? "async " : "";
      if (node.body?.type === "BlockStatement") {
        return `${async}(${params}) => ${body}`;
      }
      return `${async}(${params}) => ${body}`;
    }

    case "FunctionExpression": {
      const id = node.id ? " " + printNode(node.id) : "";
      const params = (node.params ?? []).map(printNode).join(", ");
      const body = printNode(node.body);
      const async = node.async ? "async " : "";
      const gen = node.generator ? "*" : "";
      return `${async}function${gen}${id}(${params}) ${body}`;
    }

    case "AssignmentExpression":
      return `${printNode(node.left)} ${node.operator} ${printNode(node.right)}`;

    case "BinaryExpression":
    case "LogicalExpression":
      return `${printNode(node.left)} ${node.operator} ${printNode(node.right)}`;

    case "UnaryExpression":
      if (node.prefix) {
        const space = node.operator.length > 1 ? " " : "";
        return `${node.operator}${space}${printNode(node.argument)}`;
      }
      return `${printNode(node.argument)}${node.operator}`;

    case "UpdateExpression":
      return node.prefix
        ? `${node.operator}${printNode(node.argument)}`
        : `${printNode(node.argument)}${node.operator}`;

    case "ConditionalExpression":
      return `${printNode(node.test)} ? ${printNode(node.consequent)} : ${printNode(node.alternate)}`;

    case "SequenceExpression":
      return (node.expressions ?? []).map(printNode).join(", ");

    case "SpreadElement":
      return `...${printNode(node.argument)}`;

    case "YieldExpression":
      return node.delegate
        ? `yield* ${printNode(node.argument)}`
        : `yield ${printNode(node.argument)}`;

    case "AwaitExpression":
      return `await ${printNode(node.argument)}`;

    case "TaggedTemplateExpression":
      return `${printNode(node.tag)}${printNode(node.quasi)}`;

    case "NewExpression": {
      const callee = printNode(node.callee);
      const args = (node.arguments ?? []).map(printNode).join(", ");
      return `new ${callee}(${args})`;
    }

    case "ThisExpression":
      return "this";

    // ── Patterns ───────────────────────────────────────────────────
    case "ArrayExpression":
    case "ArrayPattern": {
      const elems = (node.elements ?? []).map((e: any) => (e ? printNode(e) : "")).join(", ");
      return `[${elems}]`;
    }

    case "ObjectExpression":
    case "ObjectPattern": {
      const props = (node.properties ?? []).map(printNode).join(", ");
      return `{ ${props} }`;
    }

    case "Property": {
      const key = printNode(node.key);
      if (node.shorthand) return key;
      if (node.method) {
        const params = (node.value?.params ?? []).map(printNode).join(", ");
        const body = printNode(node.value?.body);
        return `${key}(${params}) ${body}`;
      }
      return `${key}: ${printNode(node.value)}`;
    }

    case "RestElement":
      return `...${printNode(node.argument)}`;

    case "AssignmentPattern":
      return `${printNode(node.left)} = ${printNode(node.right)}`;

    // ── Statements ─────────────────────────────────────────────────
    case "ExpressionStatement":
      return printNode(node.expression) + ";";

    case "BlockStatement": {
      const body = (node.body ?? []).map(printNode).join("\n");
      return `{\n${body}\n}`;
    }

    case "ReturnStatement":
      return node.argument ? `return ${printNode(node.argument)};` : "return;";

    case "VariableDeclaration": {
      const decls = (node.declarations ?? []).map(printNode).join(", ");
      return `${node.kind} ${decls};`;
    }

    case "VariableDeclarator": {
      const id = printNode(node.id);
      return node.init ? `${id} = ${printNode(node.init)}` : id;
    }

    case "IfStatement": {
      let result = `if (${printNode(node.test)}) ${printNode(node.consequent)}`;
      if (node.alternate) result += ` else ${printNode(node.alternate)}`;
      return result;
    }

    case "ThrowStatement":
      return `throw ${printNode(node.argument)};`;

    // ── Declarations ───────────────────────────────────────────────
    case "FunctionDeclaration": {
      const id = node.id ? printNode(node.id) : "";
      const params = (node.params ?? []).map(printNode).join(", ");
      const body = printNode(node.body);
      const async = node.async ? "async " : "";
      const gen = node.generator ? "*" : "";
      return `${async}function${gen} ${id}(${params}) ${body}`;
    }

    case "ClassDeclaration":
    case "ClassExpression": {
      const id = node.id ? ` ${printNode(node.id)}` : "";
      const superClass = node.superClass ? ` extends ${printNode(node.superClass)}` : "";
      const body = printNode(node.body);
      return `class${id}${superClass} ${body}`;
    }

    case "ClassBody": {
      const body = (node.body ?? []).map(printNode).join("\n");
      return `{\n${body}\n}`;
    }

    case "MethodDefinition": {
      const key = printNode(node.key);
      const value = node.value;
      const params = (value?.params ?? []).map(printNode).join(", ");
      const body = printNode(value?.body);
      const staticKw = node.static ? "static " : "";
      const kind = node.kind === "get" ? "get " : node.kind === "set" ? "set " : "";
      return `${staticKw}${kind}${key}(${params}) ${body}`;
    }

    case "PropertyDefinition": {
      const key = printNode(node.key);
      const staticKw = node.static ? "static " : "";
      return node.value ? `${staticKw}${key} = ${printNode(node.value)};` : `${staticKw}${key};`;
    }

    // ── Imports/Exports ────────────────────────────────────────────
    case "ImportDeclaration": {
      const specs = (node.specifiers ?? []).map(printNode);
      const source = printNode(node.source);
      if (specs.length === 0) return `import ${source};`;
      const defaultSpec = specs.find(
        (_: any, i: number) => node.specifiers[i].type === "ImportDefaultSpecifier",
      );
      const namedSpecs = node.specifiers
        .filter((s: any) => s.type === "ImportSpecifier")
        .map(printNode);
      const parts = [];
      if (defaultSpec) parts.push(defaultSpec);
      if (namedSpecs.length) parts.push(`{ ${namedSpecs.join(", ")} }`);
      return `import ${parts.join(", ")} from ${source};`;
    }

    case "ImportDefaultSpecifier":
      return printNode(node.local);

    case "ImportSpecifier": {
      const imported = printNode(node.imported);
      const local = printNode(node.local);
      return imported === local ? imported : `${imported} as ${local}`;
    }

    case "ImportNamespaceSpecifier":
      return `* as ${printNode(node.local)}`;

    case "ExportDefaultDeclaration":
      return `export default ${printNode(node.declaration)}`;

    case "ExportNamedDeclaration":
      if (node.declaration) return `export ${printNode(node.declaration)}`;
      if (node.specifiers?.length) {
        const specs = node.specifiers.map(printNode).join(", ");
        const from = node.source ? ` from ${printNode(node.source)}` : "";
        return `export { ${specs} }${from};`;
      }
      return "";

    case "ExportSpecifier": {
      const local = printNode(node.local);
      const exported = printNode(node.exported);
      return local === exported ? local : `${local} as ${exported}`;
    }

    // ── JSX ────────────────────────────────────────────────────────
    case "JSXElement": {
      const open = printNode(node.openingElement);
      const close = node.closingElement ? printNode(node.closingElement) : "";
      const children = (node.children ?? []).map(printNode).join("");
      return `${open}${children}${close}`;
    }

    case "JSXOpeningElement": {
      const name = printNode(node.name);
      const attrs = (node.attributes ?? []).map(printNode).join(" ");
      const attrStr = attrs ? " " + attrs : "";
      return node.selfClosing ? `<${name}${attrStr} />` : `<${name}${attrStr}>`;
    }

    case "JSXClosingElement":
      return `</${printNode(node.name)}>`;

    case "JSXIdentifier":
      return node.name;

    case "JSXMemberExpression":
      return `${printNode(node.object)}.${printNode(node.property)}`;

    case "JSXAttribute": {
      const name = printNode(node.name);
      return node.value ? `${name}=${printNode(node.value)}` : name;
    }

    case "JSXExpressionContainer":
      return `{${printNode(node.expression)}}`;

    case "JSXText":
      return node.value ?? node.raw ?? "";

    case "JSXSpreadAttribute":
      return `{...${printNode(node.argument)}}`;

    case "JSXFragment": {
      const children = (node.children ?? []).map(printNode).join("");
      return `<>${children}</>`;
    }

    // ── Glimmer nodes (Ember templates) ────────────────────────────
    case "GlimmerTemplate": {
      const children = (node.body ?? node.children ?? []).map(printNode).join("");
      return `<template>${children}</template>`;
    }

    case "GlimmerElementNode": {
      const tag = node.tag ?? "";
      const attrs = (node.attributes ?? []).map(printNode).join(" ");
      const modifiers = (node.modifiers ?? []).map(printNode).join(" ");
      const children = (node.children ?? []).map(printNode).join("");
      const parts = [tag];
      if (attrs) parts.push(attrs);
      if (modifiers) parts.push(modifiers);
      if (node.selfClosing) return `<${parts.join(" ")} />`;
      return `<${parts.join(" ")}>${children}</${tag}>`;
    }

    case "GlimmerTextNode":
      return node.chars ?? "";

    case "GlimmerMustacheStatement": {
      const path = printNode(node.path);
      const params = (node.params ?? []).map(printNode).join(" ");
      const hash = node.hash ? printNode(node.hash) : "";
      const parts = [path];
      if (params) parts.push(params);
      if (hash) parts.push(hash);
      return `{{${parts.join(" ")}}}`;
    }

    case "GlimmerBlockStatement": {
      const path = printNode(node.path);
      const params = (node.params ?? []).map(printNode).join(" ");
      const hash = node.hash ? printNode(node.hash) : "";
      const body = (node.body ?? node.program?.body ?? []).map(printNode).join("");
      const inverse = node.inverse
        ? `{{else}}${(node.inverse.body ?? []).map(printNode).join("")}`
        : "";
      const parts = [path];
      if (params) parts.push(params);
      if (hash) parts.push(hash);
      return `{{#${parts.join(" ")}}}${body}${inverse}{{/${printNode(node.path)}}}`;
    }

    case "GlimmerPathExpression":
      return node.original ?? (node.parts ?? []).join(".");

    case "GlimmerSubExpression": {
      const path = printNode(node.path);
      const params = (node.params ?? []).map(printNode).join(" ");
      const hash = node.hash ? printNode(node.hash) : "";
      const parts = [path];
      if (params) parts.push(params);
      if (hash) parts.push(hash);
      return `(${parts.join(" ")})`;
    }

    case "GlimmerAttrNode": {
      const name = node.name ?? "";
      const value = printNode(node.value);
      return `${name}=${value}`;
    }

    case "GlimmerConcatStatement": {
      const parts = (node.parts ?? []).map(printNode).join("");
      return `"${parts}"`;
    }

    case "GlimmerHash": {
      const pairs = (node.pairs ?? []).map(printNode).join(" ");
      return pairs;
    }

    case "GlimmerHashPair":
      return `${node.key}=${printNode(node.value)}`;

    case "GlimmerStringLiteral":
      return `"${node.value ?? ""}"`;

    case "GlimmerBooleanLiteral":
      return String(node.value);

    case "GlimmerNumberLiteral":
      return String(node.value);

    case "GlimmerNullLiteral":
      return "null";

    case "GlimmerUndefinedLiteral":
      return "undefined";

    case "GlimmerCommentStatement":
      return `{{!-- ${node.value ?? ""} --}}`;

    case "GlimmerMustacheCommentStatement":
      return `{{! ${node.value ?? ""} }}`;

    case "GlimmerElementModifierStatement": {
      const path = printNode(node.path);
      const params = (node.params ?? []).map(printNode).join(" ");
      const hash = node.hash ? printNode(node.hash) : "";
      const parts = [path];
      if (params) parts.push(params);
      if (hash) parts.push(hash);
      return `{{${parts.join(" ")}}}`;
    }

    // ── Fallback for PathExpression (used inside Glimmer nodes) ───
    case "PathExpression":
      return node.original ?? (node.parts ?? []).join(".");

    // ── Program (root) ─────────────────────────────────────────────
    case "Program":
      return (node.body ?? []).map(printNode).join("\n");

    default:
      // For unknown node types, try common patterns
      if (node.name) return node.name;
      if (node.value != null) return String(node.value);
      if (node.raw) return node.raw;
      return "";
  }
}

/**
 * A zmod `Parser` adapter for Ember's `.gjs` and `.gts` files.
 *
 * Uses `ember-eslint-parser` to parse files containing `<template>` tags
 * into an ESTree-compatible AST with embedded Glimmer template nodes.
 *
 * @example
 * ```ts
 * import { z } from 'zmod';
 * import { emberParser } from 'zmod-ember';
 *
 * const j = z.withParser(emberParser);
 * const root = j(gjsSource, { filePath: 'my-component.gjs' });
 *
 * root.find(j.Identifier, { name: 'OldName' })
 *     .replaceWith('NewName');
 *
 * console.log(root.toSource());
 * ```
 *
 * @example
 * ```ts
 * // As a transform module export
 * import type { Transform } from 'zmod';
 * import { emberParser } from 'zmod-ember';
 *
 * export const parser = emberParser;
 *
 * const transform: Transform = ({ source }, { z }) => {
 *   const root = z(source);
 *   // ... transform logic
 *   return root.toSource();
 * };
 *
 * export default transform;
 * ```
 */
export const emberParser: Parser = new EmberParserAdapter();
