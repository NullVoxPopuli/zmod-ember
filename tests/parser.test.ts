import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

// ── Basic parser integration ────────────────────────────────────────────────

describe("emberParser", () => {
  it("implements the zmod Parser interface", () => {
    expect(typeof emberParser.parse).toBe("function");
    expect(typeof emberParser.print).toBe("function");
  });

  it("works with z.withParser()", () => {
    const j = z.withParser(emberParser);
    expect(j).not.toBe(z);
    expect(typeof j).toBe("function");
  });
});

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

// ── Parsing .gts files (TypeScript + template) ──────────────────────────────

describe("parse — .gts files", () => {
  const j = z.withParser(emberParser);

  it("parses a TypeScript .gts file with typed props", () => {
    const source = `import Component from '@glimmer/component';

interface MySignature {
  Args: { name: string };
}

export default class MyComponent extends Component<MySignature> {
  <template>
    <h1>Hello {{@name}}</h1>
  </template>
}
`;
    const root = j(source, { filePath: "my-component.gts" });
    const imports = root.find(z.ImportDeclaration);
    expect(imports.length).toBeGreaterThan(0);
  });

  it("finds and renames identifiers in .gts files", () => {
    const source = `interface Args { name: string; }

export default class OldComponent {
  <template>
    <div>Hello</div>
  </template>
}
`;
    const root = j(source, { filePath: "component.gts" });
    root.find(z.Identifier, { name: "OldComponent" }).replaceWith("NewComponent");
    expect(root.toSource()).toContain("class NewComponent");
  });

  it("preserves TypeScript syntax when transforming", () => {
    const source = `export default class OldComponent {
  <template>
    <div>Hello</div>
  </template>
}
`;
    const root = j(source, { filePath: "component.gts" });
    root.find(z.Identifier, { name: "OldComponent" }).replaceWith("NewComponent");
    const output = root.toSource();
    expect(output).toContain("class NewComponent");
    expect(output).toContain("<template>");
  });
});

// ── Print function ──────────────────────────────────────────────────────────

describe("emberParser.print()", () => {
  const j = z.withParser(emberParser);

  it("prints an Identifier node", () => {
    expect(j.print(z.identifier("foo"))).toBe("foo");
  });

  it("prints a CallExpression node", () => {
    const node = z.callExpression(z.identifier("foo"), [
      z.identifier("a"),
      z.identifier("b"),
    ]);
    expect(j.print(node)).toBe("foo(a, b)");
  });

  it("prints a MemberExpression node", () => {
    const node = z.memberExpression(
      z.identifier("obj"),
      z.identifier("method"),
    );
    expect(j.print(node)).toBe("obj.method");
  });

  it("replaceWith(builderNode) uses the printer for nodes without spans", () => {
    const root = j("const x = old();", { filePath: "test.gjs" });
    root
      .find(z.CallExpression)
      .replaceWith(z.callExpression(z.identifier("newFn"), [z.identifier("arg")]));
    expect(root.toSource()).toBe("const x = newFn(arg);");
  });

  it("replaceWith(string) still works", () => {
    const root = j("const x = 1;", { filePath: "test.gjs" });
    root.find(z.Identifier, { name: "x" }).replaceWith("renamed");
    expect(root.toSource()).toBe("const renamed = 1;");
  });
});

// ── Transform module pattern ────────────────────────────────────────────────

describe("transform module pattern", () => {
  it("works as a parser export in a transform module", () => {
    const transform = ({ source }: { source: string; path: string }, { z: j }: any) => {
      const root = j(source);
      root.find(j.Identifier, { name: "oldName" }).replaceWith("newName");
      return root.toSource();
    };

    // Simulate what zmod's run() does
    const j = z.withParser(emberParser);
    const source = "const oldName = 1;";
    const result = transform({ source, path: "test.gjs" }, { z: j, report: console.log });
    expect(result).toBe("const newName = 1;");
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe("edge cases", () => {
  const j = z.withParser(emberParser);

  it("handles empty source", () => {
    const root = j("", { filePath: "empty.gjs" });
    expect(root.toSource()).toBe("");
  });

  it("handles template-only .gjs file", () => {
    const source = `<template>
  <div>Hello World</div>
</template>
`;
    const root = j(source, { filePath: "template-only.gjs" });
    // Verify we can find nodes and the source is preserved
    expect(root.toSource()).toBe(source);
  });

  it("handles multiple imports with a template", () => {
    const source = `import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';

export default class Counter extends Component {
  @tracked count = 0;

  <template>
    <button>{{this.count}}</button>
  </template>
}
`;
    const root = j(source, { filePath: "counter.gjs" });
    const imports = root.find(z.ImportDeclaration);
    expect(imports.length).toBe(2);
  });

  it("defaults filePath to .gjs when not provided", () => {
    // Should not throw — defaults to .gjs
    const root = j("const x = 1;");
    expect(root.toSource()).toBe("const x = 1;");
  });
});
