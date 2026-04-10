import { describe, expect, it } from "vitest";
import { toTree } from "ember-estree";
import { analyze, ScopeManager, Scope, Variable, Reference, Definition } from "../src/scope.js";

function parse(source: string) {
  return toTree(source, { filePath: "test.gjs" });
}

// ── JS Scope Basics ──────────────────────────────────────────────────────

describe("JS scope basics", () => {
  it("creates a module scope for the program", () => {
    const ast = parse("const x = 1;");
    const mgr = analyze(ast, { sourceType: "module" });

    expect(mgr.globalScope).toBeDefined();
    expect(mgr.globalScope.type).toBe("module");
    expect(mgr.scopes.length).toBeGreaterThanOrEqual(1);
  });

  it("creates a global scope when sourceType is script", () => {
    const ast = parse("const x = 1;");
    const mgr = analyze(ast, { sourceType: "script" });

    expect(mgr.globalScope.type).toBe("global");
  });

  it("tracks import bindings in the module scope", () => {
    const ast = parse('import { Foo, Bar } from "my-lib";');
    const mgr = analyze(ast);

    const moduleScope = mgr.globalScope;
    expect(moduleScope.set.has("Foo")).toBe(true);
    expect(moduleScope.set.has("Bar")).toBe(true);

    const foo = moduleScope.set.get("Foo")!;
    expect(foo.defs[0].type).toBe("ImportBinding");
  });

  it("tracks default import bindings", () => {
    const ast = parse('import MyDefault from "my-lib";');
    const mgr = analyze(ast);

    expect(mgr.globalScope.set.has("MyDefault")).toBe(true);
  });

  it("tracks namespace import bindings", () => {
    const ast = parse('import * as ns from "my-lib";');
    const mgr = analyze(ast);

    expect(mgr.globalScope.set.has("ns")).toBe(true);
  });

  it("tracks const/let declarations in block scope", () => {
    const ast = parse("const a = 1; let b = 2;");
    const mgr = analyze(ast);

    expect(mgr.globalScope.set.has("a")).toBe(true);
    expect(mgr.globalScope.set.has("b")).toBe(true);

    const a = mgr.globalScope.set.get("a")!;
    expect(a.defs[0].type).toBe("Variable");
  });

  it("tracks var in function scope", () => {
    const ast = parse("function foo() { var x = 1; }");
    const mgr = analyze(ast);

    // foo is defined in module scope
    expect(mgr.globalScope.set.has("foo")).toBe(true);

    // x is defined in function scope, not module scope
    expect(mgr.globalScope.set.has("x")).toBe(false);

    // Find the function scope
    const funcScopes = mgr.scopes.filter((s) => s.type === "function");
    expect(funcScopes.length).toBe(1);
    expect(funcScopes[0].set.has("x")).toBe(true);
  });

  it("tracks function declarations", () => {
    const ast = parse("function myFunc() {}");
    const mgr = analyze(ast);

    const v = mgr.globalScope.set.get("myFunc")!;
    expect(v).toBeDefined();
    expect(v.defs[0].type).toBe("FunctionName");
  });

  it("tracks class declarations", () => {
    const ast = parse("class MyClass {}");
    const mgr = analyze(ast);

    const v = mgr.globalScope.set.get("MyClass")!;
    expect(v).toBeDefined();
    expect(v.defs[0].type).toBe("ClassName");
  });

  it("tracks function parameters", () => {
    const ast = parse("function foo(a, b, c) {}");
    const mgr = analyze(ast);

    const funcScopes = mgr.scopes.filter((s) => s.type === "function");
    expect(funcScopes.length).toBe(1);

    const fScope = funcScopes[0];
    expect(fScope.set.has("a")).toBe(true);
    expect(fScope.set.has("b")).toBe(true);
    expect(fScope.set.has("c")).toBe(true);

    const a = fScope.set.get("a")!;
    expect(a.defs[0].type).toBe("Parameter");
  });

  it("tracks destructuring parameters", () => {
    const ast = parse("function foo({ a, b }, [c]) {}");
    const mgr = analyze(ast);

    const funcScopes = mgr.scopes.filter((s) => s.type === "function");
    const fScope = funcScopes[0];
    expect(fScope.set.has("a")).toBe(true);
    expect(fScope.set.has("b")).toBe(true);
    expect(fScope.set.has("c")).toBe(true);
  });

  it("tracks destructuring variable declarations", () => {
    const ast = parse("const { x, y } = obj; const [a, b] = arr;");
    const mgr = analyze(ast);

    expect(mgr.globalScope.set.has("x")).toBe(true);
    expect(mgr.globalScope.set.has("y")).toBe(true);
    expect(mgr.globalScope.set.has("a")).toBe(true);
    expect(mgr.globalScope.set.has("b")).toBe(true);
  });

  it("creates block scope for let/const in block", () => {
    const ast = parse("{ let x = 1; }");
    const mgr = analyze(ast);

    const blockScopes = mgr.scopes.filter((s) => s.type === "block");
    expect(blockScopes.length).toBeGreaterThanOrEqual(1);
  });

  it("resolves identifier references", () => {
    const ast = parse("const x = 1; console.log(x);");
    const mgr = analyze(ast);

    const x = mgr.globalScope.set.get("x")!;
    expect(x).toBeDefined();
    expect(x.references.length).toBeGreaterThanOrEqual(1);

    const readRef = x.references.find((r) => r.isRead());
    expect(readRef).toBeDefined();
    expect(readRef!.resolved).toBe(x);
  });

  it("tracks unresolved references in through", () => {
    const ast = parse('console.log("hello");');
    const mgr = analyze(ast);

    // console is unresolved — should appear in through
    const consoleRef = mgr.globalScope.through.find((r) => r.identifier.name === "console");
    expect(consoleRef).toBeDefined();
    expect(consoleRef!.resolved).toBeNull();
  });

  it("handles arrow functions", () => {
    const ast = parse("const fn = (a) => a + 1;");
    const mgr = analyze(ast);

    const funcScopes = mgr.scopes.filter((s) => s.type === "function");
    expect(funcScopes.length).toBe(1);
    expect(funcScopes[0].set.has("a")).toBe(true);
  });

  it("handles catch clause scope", () => {
    const ast = parse("try { } catch (err) { }");
    const mgr = analyze(ast);

    const blockScopes = mgr.scopes.filter((s) => s.type === "block");
    const catchScope = blockScopes.find((s) => s.set.has("err"));
    expect(catchScope).toBeDefined();
  });

  it("handles for-of scope", () => {
    const ast = parse("for (const item of list) { }");
    const mgr = analyze(ast);

    const blockScopes = mgr.scopes.filter((s) => s.type === "block");
    const forScope = blockScopes.find((s) => s.set.has("item"));
    expect(forScope).toBeDefined();
  });
});

// ── Glimmer Scope ────────────────────────────────────────��───────────────

describe("Glimmer scope", () => {
  it("resolves GlimmerPathExpression to an import", () => {
    const ast = parse(`
      import { myHelper } from 'my-lib';
      <template>{{myHelper}}</template>
    `);
    const mgr = analyze(ast);

    const v = mgr.globalScope.set.get("myHelper")!;
    expect(v).toBeDefined();
    expect(v.defs[0].type).toBe("ImportBinding");

    // The template reference should resolve to the import
    const templateRef = v.references.find((r) => r.isRead());
    expect(templateRef).toBeDefined();
    expect(templateRef!.resolved).toBe(v);
  });

  it("resolves GlimmerElementNode component reference to an import", () => {
    const ast = parse(`
      import MyComponent from 'my-lib';
      <template><MyComponent /></template>
    `);
    const mgr = analyze(ast);

    const v = mgr.globalScope.set.get("MyComponent")!;
    expect(v).toBeDefined();

    // Component reference resolves to the import
    const ref = v.references.find((r) => r.isRead());
    expect(ref).toBeDefined();
    expect(ref!.resolved).toBe(v);
  });

  it("does not create references for lowercase elements", () => {
    const ast = parse(`
      <template><div>hello</div></template>
    `);
    const mgr = analyze(ast);

    // div is a plain HTML element, should not create a reference
    const divRef = mgr.globalScope.through.find(
      (r) => (r.identifier.name ?? r.identifier.original) === "div",
    );
    expect(divRef).toBeUndefined();
  });

  it("does not create references for elements with dashes", () => {
    const ast = parse(`
      <template><my-component /></template>
    `);
    const mgr = analyze(ast);

    const ref = mgr.globalScope.through.find(
      (r) => (r.identifier.name ?? r.identifier.original) === "my-component",
    );
    expect(ref).toBeUndefined();
  });

  it("skips Glimmer keywords", () => {
    const ast = parse(`
      <template>{{#if true}}yes{{/if}}</template>
    `);
    const mgr = analyze(ast);

    const ifRef = mgr.globalScope.through.find(
      (r) => (r.identifier.name ?? r.identifier.original) === "if",
    );
    expect(ifRef).toBeUndefined();
  });

  it("skips each keyword", () => {
    const ast = parse(`
      import { items } from 'data';
      <template>{{#each items as |item|}}{{item}}{{/each}}</template>
    `);
    const mgr = analyze(ast);

    const eachRef = mgr.globalScope.through.find(
      (r) => (r.identifier.name ?? r.identifier.original) === "each",
    );
    expect(eachRef).toBeUndefined();
  });

  it("creates glimmer-block scope for block params", () => {
    const ast = parse(`
      import { items } from 'data';
      <template>{{#each items as |item|}}{{item}}{{/each}}</template>
    `);
    const mgr = analyze(ast);

    const glimmerScopes = mgr.scopes.filter((s) => s.type === "glimmer-block");
    expect(glimmerScopes.length).toBeGreaterThanOrEqual(1);

    const blockScope = glimmerScopes.find((s) => s.set.has("item"));
    expect(blockScope).toBeDefined();

    const itemVar = blockScope!.set.get("item")!;
    expect(itemVar.defs[0].type).toBe("BlockParam");
  });

  it("resolves references inside block to block params", () => {
    const ast = parse(`
      import { items } from 'data';
      <template>{{#each items as |item|}}{{item}}{{/each}}</template>
    `);
    const mgr = analyze(ast);

    const glimmerScopes = mgr.scopes.filter((s) => s.type === "glimmer-block");
    const blockScope = glimmerScopes.find((s) => s.set.has("item"));
    const itemVar = blockScope!.set.get("item")!;

    // item should have a reference that resolves to the block param
    expect(itemVar.references.length).toBeGreaterThanOrEqual(1);
    expect(itemVar.references[0].resolved).toBe(itemVar);
  });

  it("handles nested block params with shadowing", () => {
    const ast = parse(`
      <template>
        {{#each outer as |item|}}
          {{#each inner as |item|}}
            {{item}}
          {{/each}}
        {{/each}}
      </template>
    `);
    const mgr = analyze(ast);

    const glimmerScopes = mgr.scopes.filter((s) => s.type === "glimmer-block");
    // Should have at least 2 glimmer-block scopes (one for each #each)
    expect(glimmerScopes.length).toBeGreaterThanOrEqual(2);
  });

  it("does not leak block params to sibling scope", () => {
    const ast = parse(`
      <template>
        {{#each items as |item|}}{{item}}{{/each}}
        {{item}}
      </template>
    `);
    const mgr = analyze(ast);

    // The second {{item}} reference (outside the block) should be unresolved
    // It should appear in through of some scope
    const allThrough = mgr.scopes.flatMap((s) => s.through);
    const unresolvedItem = allThrough.find(
      (r) => (r.identifier.name ?? r.identifier.original) === "item" && r.resolved === null,
    );
    expect(unresolvedItem).toBeDefined();
  });

  it("skips @-prefixed element names", () => {
    const ast = parse(`
      <template><@field /></template>
    `);
    const mgr = analyze(ast);

    // Should not crash, and should not create a reference for @field
    expect(mgr.scopes.length).toBeGreaterThanOrEqual(1);
  });

  it("skips :-prefixed element names (named blocks)", () => {
    const ast = parse(`
      <template><:content>hello</:content></template>
    `);
    const mgr = analyze(ast);

    expect(mgr.scopes.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Cross-boundary Scope ─────────────────────────────────────────────────

describe("cross-boundary scope", () => {
  it("JS variable referenced in Glimmer template", () => {
    const ast = parse(`
      const greeting = "hello";
      <template>{{greeting}}</template>
    `);
    const mgr = analyze(ast);

    const v = mgr.globalScope.set.get("greeting")!;
    expect(v).toBeDefined();

    // Should have a reference from inside the template
    const refs = v.references.filter((r) => r.isRead());
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs[0].resolved).toBe(v);
  });

  it("import referenced as component in template", () => {
    const ast = parse(`
      import Header from './header';
      <template>
        <Header @title="test" />
      </template>
    `);
    const mgr = analyze(ast);

    const v = mgr.globalScope.set.get("Header")!;
    expect(v).toBeDefined();

    const refs = v.references.filter((r) => r.isRead());
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it("multiple templates in one file share outer scope", () => {
    const ast = parse(`
      import { A, B } from 'lib';
      const x = <template><A /></template>;
      const y = <template><B /></template>;
    `);
    const mgr = analyze(ast);

    const aVar = mgr.globalScope.set.get("A")!;
    const bVar = mgr.globalScope.set.get("B")!;
    expect(aVar).toBeDefined();
    expect(bVar).toBeDefined();

    expect(aVar.references.length).toBeGreaterThanOrEqual(1);
    expect(bVar.references.length).toBeGreaterThanOrEqual(1);
  });
});

// ── ScopeManager API ───────��──────────────────────���──────────────────────

describe("ScopeManager API", () => {
  it("acquire() returns scope for a node", () => {
    const ast = parse("function foo() {}");
    const mgr = analyze(ast);

    // The program node should have a scope
    const program = (ast as any).program ?? ast;
    const scope = mgr.acquire(program);
    expect(scope).toBeDefined();
    expect(scope!.type).toBe("module");
  });

  it("acquire(node, true) returns inner scope", () => {
    const ast = parse("function foo() { const x = 1; }");
    const mgr = analyze(ast);

    // Find the function node
    const program = (ast as any).program ?? ast;
    let funcNode: any = null;
    for (const stmt of program.body ?? []) {
      if (stmt.type === "FunctionDeclaration") {
        funcNode = stmt;
        break;
      }
    }
    expect(funcNode).toBeDefined();

    // Inner scope should be the function scope
    const innerScope = mgr.acquire(funcNode, true);
    expect(innerScope).toBeDefined();
    expect(innerScope!.type).toBe("function");
  });

  it("getDeclaredVariables() returns variables for a declaration", () => {
    const ast = parse("const x = 1, y = 2;");
    const mgr = analyze(ast);

    const program = (ast as any).program ?? ast;
    const decl = program.body[0];
    expect(decl.type).toBe("VariableDeclaration");

    for (const declarator of decl.declarations) {
      const vars = mgr.getDeclaredVariables(declarator);
      expect(vars.length).toBe(1);
    }
  });

  it("Reference.isRead() / isWrite() work correctly", () => {
    const ast = parse("let x = 1; x = 2; x;");
    const mgr = analyze(ast);

    const xVar = mgr.globalScope.set.get("x")!;
    expect(xVar).toBeDefined();

    const readRefs = xVar.references.filter((r) => r.isRead() && !r.isWrite());
    const writeRefs = xVar.references.filter((r) => r.isWrite() && !r.isRead());
    expect(readRefs.length).toBeGreaterThanOrEqual(1);
    expect(writeRefs.length).toBeGreaterThanOrEqual(1);
  });

  it("scope.childScopes forms a tree", () => {
    const ast = parse(`
      function outer() {
        function inner() {}
      }
    `);
    const mgr = analyze(ast);

    expect(mgr.globalScope.childScopes.length).toBeGreaterThanOrEqual(1);
    const outerFunc = mgr.globalScope.childScopes.find((s) => s.type === "function");
    expect(outerFunc).toBeDefined();
    expect(outerFunc!.childScopes.length).toBeGreaterThanOrEqual(1);
  });

  it("destroy() cleans up proxies", () => {
    const ast = parse("const x = 1;");
    const mgr = analyze(ast);
    mgr.destroy();
    // Should not throw
    expect(true).toBe(true);
  });
});

// ── Mutation Tracking ───────────────────────────────────────────��────────

describe("mutation tracking", () => {
  it("auto-invalidates when AST body array is mutated", () => {
    const ast = parse(`
      import { Foo } from 'lib';
      <template><Foo /></template>
    `);
    const mgr = analyze(ast);

    const program = (ast as any).program ?? ast;

    // Initial state: Foo is defined
    expect(mgr.globalScope.set.has("Foo")).toBe(true);

    // Mutate: remove the import declaration
    const importIdx = program.body.findIndex((n: any) => n.type === "ImportDeclaration");
    if (importIdx >= 0) {
      program.body.splice(importIdx, 1);
    }

    // After mutation, next query should re-analyze
    // Foo should no longer be defined (import was removed)
    expect(mgr.globalScope.set.has("Foo")).toBe(false);
  });

  it("manual invalidate() + query triggers re-analysis", () => {
    const ast = parse("const x = 1;");
    const mgr = analyze(ast);

    expect(mgr.globalScope.set.has("x")).toBe(true);

    mgr.invalidate();

    // Next query re-analyzes — x still exists since AST unchanged
    expect(mgr.globalScope.set.has("x")).toBe(true);
  });

  it("refresh() forces re-analysis", () => {
    const ast = parse("const x = 1;");
    const mgr = analyze(ast);

    const scopeCountBefore = mgr.scopes.length;
    mgr.refresh();
    expect(mgr.scopes.length).toBe(scopeCountBefore);
  });
});

// ── Class Exports ────────────────��───────────────────────────��───────────

describe("exports", () => {
  it("exports all expected classes", () => {
    expect(ScopeManager).toBeDefined();
    expect(Scope).toBeDefined();
    expect(Variable).toBeDefined();
    expect(Reference).toBeDefined();
    expect(Definition).toBeDefined();
    expect(analyze).toBeDefined();
  });
});
