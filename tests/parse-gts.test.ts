import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

describe("parse — .gts files", () => {
  const j = z.withParser(emberParser);

  // TODO: unskip once ember-estree handles .gts/.gjs extensions natively
  it.skip("parses a TypeScript .gts file with typed props", () => {
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

  // TODO: unskip once ember-estree handles .gts/.gjs extensions natively
  it.skip("finds and renames identifiers in .gts files", () => {
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
