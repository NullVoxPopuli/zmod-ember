import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

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
