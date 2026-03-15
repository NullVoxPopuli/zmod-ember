import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

const j = z.withParser(emberParser);

// ── Renaming elements ──────────────────────────────────────────────────

describe("Glimmer — renaming elements", () => {
  it("renames a component invocation (opening + closing tag)", () => {
    const source = `<template>
  <OldComponent>Hello</OldComponent>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root
      .find("GlimmerElementNode", { tag: "OldComponent" })
      .replaceWith("<NewComponent>Hello</NewComponent>");
    const output = root.toSource();
    expect(output).toContain("<NewComponent>Hello</NewComponent>");
    expect(output).not.toContain("OldComponent");
  });

  it("renames a self-closing component", () => {
    const source = `<template>
  <OldWidget />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerElementNode", { tag: "OldWidget" }).replaceWith("<NewWidget />");
    expect(root.toSource()).toContain("<NewWidget />");
    expect(root.toSource()).not.toContain("OldWidget");
  });

  it("renames a plain HTML element", () => {
    const source = `<template>
  <div class="wrapper">content</div>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root
      .find("GlimmerElementNode", { tag: "div" })
      .replaceWith('<section class="wrapper">content</section>');
    expect(root.toSource()).toContain("<section");
    expect(root.toSource()).not.toContain("<div");
  });

  it("renames one component among siblings", () => {
    const source = `<template>
  <Header />
  <OldBody>content</OldBody>
  <Footer />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerElementNode", { tag: "OldBody" }).replaceWith("<NewBody>content</NewBody>");
    const output = root.toSource();
    expect(output).toContain("<Header />");
    expect(output).toContain("<NewBody>content</NewBody>");
    expect(output).toContain("<Footer />");
    expect(output).not.toContain("OldBody");
  });
});

// ── Renaming named blocks ──────────────────────────────────────────────

describe("Glimmer — renaming named blocks", () => {
  it("renames a named block", () => {
    const source = `<template>
  <MyComponent>
    <:oldSlot>slot content</:oldSlot>
  </MyComponent>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root
      .find("GlimmerElementNode", { tag: ":oldSlot" })
      .replaceWith("<:newSlot>slot content</:newSlot>");
    const output = root.toSource();
    expect(output).toContain("<:newSlot>");
    expect(output).toContain("</:newSlot>");
    expect(output).not.toContain("oldSlot");
  });

  it("renames one named block while preserving others", () => {
    const source = `<template>
  <Layout>
    <:header>Header</:header>
    <:oldBody>Body</:oldBody>
    <:footer>Footer</:footer>
  </Layout>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerElementNode", { tag: ":oldBody" }).replaceWith("<:content>Body</:content>");
    const output = root.toSource();
    expect(output).toContain("<:header>Header</:header>");
    expect(output).toContain("<:content>Body</:content>");
    expect(output).toContain("<:footer>Footer</:footer>");
    expect(output).not.toContain("oldBody");
  });
});

// ── Renaming arguments ─────────────────────────────────────────────────

describe("Glimmer — renaming arguments", () => {
  it("renames a component argument", () => {
    const source = `<template>
  <MyComponent @oldArg={{this.value}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerAttrNode", { name: "@oldArg" }).replaceWith("@newArg={{this.value}}");
    expect(root.toSource()).toContain("@newArg={{this.value}}");
    expect(root.toSource()).not.toContain("@oldArg");
  });

  it("renames one argument while preserving others", () => {
    const source = `<template>
  <MyComponent @title={{this.title}} @oldProp={{this.data}} @count={{5}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerAttrNode", { name: "@oldProp" }).replaceWith("@newProp={{this.data}}");
    const output = root.toSource();
    expect(output).toContain("@title={{this.title}}");
    expect(output).toContain("@newProp={{this.data}}");
    expect(output).toContain("@count={{5}}");
    expect(output).not.toContain("@oldProp");
  });

  it("renames an argument with a string value", () => {
    const source = `<template>
  <Input @oldType="text" />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerAttrNode", { name: "@oldType" }).replaceWith('@type="text"');
    expect(root.toSource()).toContain('@type="text"');
    expect(root.toSource()).not.toContain("@oldType");
  });
});

// ── Replacing a whole component (default block → named blocks) ─────────

describe("Glimmer — replacing a component with named blocks", () => {
  it("replaces a component with default block to one with named blocks", () => {
    const source = `import Component from '@glimmer/component';

export default class Page extends Component {
  <template>
    <OldCard @title={{this.title}}>
      Card body content
    </OldCard>
  </template>
}
`;
    const root = j(source, { filePath: "page.gjs" });
    root.find("GlimmerElementNode", { tag: "OldCard" }).replaceWith(
      `<NewCard>
      <:header>{{this.title}}</:header>
      <:body>Card body content</:body>
    </NewCard>`,
    );
    const output = root.toSource();
    expect(output).toContain("<NewCard>");
    expect(output).toContain("<:header>{{this.title}}</:header>");
    expect(output).toContain("<:body>Card body content</:body>");
    expect(output).not.toContain("OldCard");
    // JavaScript should still be intact
    expect(output).toContain("import Component");
    expect(output).toContain("export default class Page");
  });

  it("replaces a self-closing component with one that has named blocks", () => {
    const source = `<template>
  <SimpleButton @label={{this.label}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerElementNode", { tag: "SimpleButton" }).replaceWith(
      `<FancyButton>
      <:icon><Icon @name="star" /></:icon>
      <:label>{{this.label}}</:label>
    </FancyButton>`,
    );
    const output = root.toSource();
    expect(output).toContain("<FancyButton>");
    expect(output).toContain("<:icon>");
    expect(output).toContain("<:label>");
    expect(output).not.toContain("SimpleButton");
  });
});

// ── Finding and filtering Glimmer AST nodes ────────────────────────────

describe("Glimmer — finding and filtering nodes", () => {
  it("finds all GlimmerElementNode nodes", () => {
    const source = `<template>
  <div>
    <MyComponent />
    <span>text</span>
  </div>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    // div, MyComponent, span — the outer <template> is a GlimmerTemplate
    const elems = root.find("GlimmerElementNode");
    expect(elems.length).toBeGreaterThanOrEqual(3);
  });

  it("finds GlimmerElementNode by tag name", () => {
    const source = `<template>
  <MyComponent />
  <OtherComponent />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const found = root.find("GlimmerElementNode", { tag: "MyComponent" });
    expect(found.length).toBe(1);
  });

  it("finds GlimmerAttrNode for all arguments", () => {
    const source = `<template>
  <MyComponent @name={{this.name}} @age={{this.age}} class="my-class" />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const allAttrs = root.find("GlimmerAttrNode");
    expect(allAttrs.length).toBe(3); // @name, @age, class
  });

  it("finds GlimmerBlockStatement nodes", () => {
    const source = `<template>
  {{#if this.show}}
    <div>Visible</div>
  {{else}}
    <div>Hidden</div>
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const blocks = root.find("GlimmerBlockStatement");
    expect(blocks.length).toBe(1);
  });

  it("finds GlimmerMustacheStatement nodes", () => {
    const source = `<template>
  <MyComponent @onClick={{fn this.handleClick "arg"}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const mustaches = root.find("GlimmerMustacheStatement");
    expect(mustaches.length).toBe(1);
  });

  it("finds GlimmerPathExpression nodes", () => {
    const source = `<template>
  {{#if this.show}}
    {{this.greeting}}
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const paths = root.find("GlimmerPathExpression");
    expect(paths.length).toBeGreaterThanOrEqual(2); // `if`, `this.show`, `this.greeting`
  });

  it("finds GlimmerTextNode nodes", () => {
    const source = `<template>
  <div>Hello World</div>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const texts = root.find("GlimmerTextNode");
    expect(texts.length).toBeGreaterThan(0);
  });
});

// ── Glimmer operations in .gts files ───────────────────────────────────

describe("Glimmer — operations in .gts files", () => {
  it("renames a component in a TypeScript .gts file", () => {
    const source = `import Component from '@glimmer/component';

interface Signature {
  Args: { name: string };
}

export default class MyPage extends Component<Signature> {
  <template>
    <OldWidget @name={{@name}} />
  </template>
}
`;
    const root = j(source, { filePath: "page.gts" });
    root
      .find("GlimmerElementNode", { tag: "OldWidget" })
      .replaceWith("<NewWidget @name={{@name}} />");
    const output = root.toSource();
    expect(output).toContain("<NewWidget");
    expect(output).not.toContain("OldWidget");
    // TypeScript + JS should be preserved
    expect(output).toContain("interface Signature");
    expect(output).toContain("Component<Signature>");
  });

  it("renames an argument in a .gts file", () => {
    const source = `import Component from '@glimmer/component';

interface Signature {
  Args: { oldProp: string };
}

export default class MyComponent extends Component<Signature> {
  <template>
    <ChildComponent @oldProp={{@oldProp}} />
  </template>
}
`;
    const root = j(source, { filePath: "component.gts" });
    root.find("GlimmerAttrNode", { name: "@oldProp" }).replaceWith("@newProp={{@oldProp}}");
    const output = root.toSource();
    expect(output).toContain("@newProp={{@oldProp}}");
    expect(output).toContain("interface Signature");
  });
});
