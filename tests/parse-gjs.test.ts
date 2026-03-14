import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

// ── Parsing plain JavaScript (.gjs without template) ────────────────────────

describe("parse — plain JavaScript", () => {
  const j = z.withParser(emberParser);

  it("parses a simple variable declaration", () => {
    const root = j('const greeting = "hello";', { filePath: "test.gjs" });
    const decls = root.find(z.VariableDeclaration);
    expect(decls.length).toBeGreaterThan(0);
  });

  it("finds identifiers", () => {
    const root = j('const greeting = "hello";', { filePath: "test.gjs" });
    const ids = root.find(z.Identifier, { name: "greeting" });
    expect(ids.length).toBe(1);
  });

  it("nodes have start/end byte offsets", () => {
    const source = 'const greeting = "hello";';
    const root = j(source, { filePath: "test.gjs" });
    const id = root.find(z.Identifier, { name: "greeting" }).at(0)!;
    expect(typeof id.node.start).toBe("number");
    expect(typeof id.node.end).toBe("number");
    expect(id.node.start).toBeGreaterThanOrEqual(0);
    expect(id.node.end).toBeGreaterThan(id.node.start);
    expect(source.slice(id.node.start, id.node.end)).toBe("greeting");
  });

  it("toSource() applies span patches correctly", () => {
    const source = 'const greeting = "hello";';
    const root = j(source, { filePath: "test.gjs" });
    root.find(z.Identifier, { name: "greeting" }).replaceWith("message");
    expect(root.toSource()).toBe('const message = "hello";');
  });

  it("finds import declarations", () => {
    const source = `import Component from '@glimmer/component';\nconst x = 1;`;
    const root = j(source, { filePath: "test.gjs" });
    const imports = root.find(z.ImportDeclaration);
    expect(imports.length).toBe(1);
  });

  it("renames import default specifiers", () => {
    const source = `import Foo from 'some-module';`;
    const root = j(source, { filePath: "test.gjs" });
    root.find(z.Identifier, { name: "Foo" }).replaceWith("Bar");
    expect(root.toSource()).toBe(`import Bar from 'some-module';`);
  });
});

// ── Parsing .gjs files with <template> ──────────────────────────────────────

describe("parse — .gjs with <template>", () => {
  const j = z.withParser(emberParser);

  it("parses a component class with a template", () => {
    const source = `import Component from '@glimmer/component';

export default class MyComponent extends Component {
  <template>
    <h1>Hello</h1>
  </template>
}
`;
    const root = j(source, { filePath: "my-component.gjs" });
    const imports = root.find(z.ImportDeclaration);
    expect(imports.length).toBeGreaterThan(0);
  });

  it("finds ClassDeclaration inside a class with template", () => {
    const source = `export default class MyComponent {
  <template>
    <div>Hello</div>
  </template>
}
`;
    const root = j(source, { filePath: "my-component.gjs" });
    const classes = root.find(z.ClassDeclaration);
    expect(classes.length).toBeGreaterThan(0);
  });

  it("renames a class name in a .gjs file", () => {
    const source = `export default class OldName {
  <template>
    <div>Hello</div>
  </template>
}
`;
    const root = j(source, { filePath: "component.gjs" });
    root.find(z.Identifier, { name: "OldName" }).replaceWith("NewName");
    expect(root.toSource()).toContain("class NewName");
    // Template should be preserved
    expect(root.toSource()).toContain("<template>");
    expect(root.toSource()).toContain("<div>Hello</div>");
  });

  it("renames an identifier used in JavaScript alongside a template", () => {
    const source = `const value = 42;

<template>
  <div>{{value}}</div>
</template>
`;
    const root = j(source, { filePath: "component.gjs" });
    root.find(z.Identifier, { name: "value" }).replaceWith("count");
    const output = root.toSource();
    expect(output).toContain("const count = 42;");
  });
});
