import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

const j = z.withParser(emberParser);

// ── Nested template operations ───────────────────────────────────────────

describe("Glimmer — nested template operations", () => {
  it("finds a deeply nested component inside a block statement", () => {
    const source = `<template>
  {{#if this.show}}
    <Outer>
      <Inner @value={{this.val}} />
    </Outer>
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const inner = root.find("GlimmerElementNode", { tag: "Inner" });
    expect(inner.length).toBe(1);
  });

  it("renames a nested component without affecting the outer", () => {
    const source = `<template>
  <Wrapper>
    <OldChild>content</OldChild>
    <SiblingChild />
  </Wrapper>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root
      .find("GlimmerElementNode", { tag: "OldChild" })
      .replaceWith("<NewChild>content</NewChild>");
    const output = root.toSource();
    expect(output).toContain("<Wrapper>");
    expect(output).toContain("</Wrapper>");
    expect(output).toContain("<NewChild>content</NewChild>");
    expect(output).toContain("<SiblingChild />");
    expect(output).not.toContain("OldChild");
  });

  it("replaces a component nested inside multiple levels of blocks", () => {
    const source = `<template>
  {{#if this.a}}
    {{#if this.b}}
      <DeepComponent @data={{this.data}} />
    {{/if}}
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root
      .find("GlimmerElementNode", { tag: "DeepComponent" })
      .replaceWith("<ReplacedComponent @data={{this.data}} />");
    const output = root.toSource();
    expect(output).toContain("<ReplacedComponent");
    expect(output).not.toContain("DeepComponent");
  });

  it("finds components nested inside named blocks", () => {
    const source = `<template>
  <Layout>
    <:sidebar>
      <NavMenu @items={{this.navItems}} />
    </:sidebar>
    <:main>
      <ContentArea>
        <ArticleCard @title={{this.title}} />
      </ContentArea>
    </:main>
  </Layout>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const navMenu = root.find("GlimmerElementNode", { tag: "NavMenu" });
    const articleCard = root.find("GlimmerElementNode", { tag: "ArticleCard" });
    expect(navMenu.length).toBe(1);
    expect(articleCard.length).toBe(1);
  });
});

// ── Block statements ─────────────────────────────────────────────────────

describe("Glimmer — block statement operations", () => {
  it("finds an {{#each}} block statement", () => {
    const source = `<template>
  {{#each this.items as |item|}}
    <li>{{item.name}}</li>
  {{/each}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const blocks = root.find("GlimmerBlockStatement");
    expect(blocks.length).toBe(1);
  });

  it("finds multiple block statements", () => {
    const source = `<template>
  {{#if this.show}}
    {{#each this.items as |item|}}
      <div>{{item}}</div>
    {{/each}}
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const blocks = root.find("GlimmerBlockStatement");
    expect(blocks.length).toBe(2);
  });

  it("replaces a whole block statement", () => {
    const source = `<template>
  {{#if this.isLoading}}
    <Spinner />
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root
      .find("GlimmerBlockStatement")
      .replaceWith("{{#if this.isLoading}}\n    <LoadingOverlay />\n  {{/if}}");
    const output = root.toSource();
    expect(output).toContain("<LoadingOverlay />");
    expect(output).not.toContain("<Spinner />");
  });

  it("finds an {{#unless}} block and its path expression", () => {
    const source = `<template>
  {{#unless this.hidden}}
    <p>Visible content</p>
  {{/unless}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const blocks = root.find("GlimmerBlockStatement");
    expect(blocks.length).toBe(1);
    // The path expression "unless" should be findable
    const paths = root.find("GlimmerPathExpression", { original: "unless" });
    expect(paths.length).toBe(1);
  });

  it("finds block params in an {{#each}} block", () => {
    const source = `<template>
  {{#each this.items as |item index|}}
    <div>{{index}}: {{item.name}}</div>
  {{/each}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const blockParams = root.find("GlimmerBlockParam");
    expect(blockParams.length).toBe(2); // item, index
  });

  it("finds block params in a {{#let}} block", () => {
    const source = `<template>
  {{#let this.computedValue as |val|}}
    <span>{{val}}</span>
  {{/let}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const blockParams = root.find("GlimmerBlockParam");
    expect(blockParams.length).toBe(1);
    const lets = root.find("GlimmerPathExpression", { original: "let" });
    expect(lets.length).toBe(1);
  });

  it("finds block params in named blocks with |params|", () => {
    const source = `<template>
  <DataTable @data={{this.rows}} as |row|>
    <span>{{row.name}}</span>
  </DataTable>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const blockParams = root.find("GlimmerBlockParam");
    expect(blockParams.length).toBe(1);
  });
});

// ── Element modifiers ────────────────────────────────────────────────────

describe("Glimmer — element modifier operations", () => {
  it("finds an {{on}} modifier", () => {
    const source = `<template>
  <button {{on "click" this.handleClick}}>Click me</button>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const modifiers = root.find("GlimmerElementModifierStatement");
    expect(modifiers.length).toBe(1);
  });

  it("finds multiple modifiers on different elements", () => {
    const source = `<template>
  <button {{on "click" this.save}}>Save</button>
  <input {{on "input" this.update}} {{on "focus" this.highlight}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const modifiers = root.find("GlimmerElementModifierStatement");
    expect(modifiers.length).toBe(3);
  });

  it("replaces an element with modifiers", () => {
    const source = `<template>
  <button {{on "click" this.oldHandler}}>Click</button>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root
      .find("GlimmerElementNode", { tag: "button" })
      .replaceWith('<button {{on "click" this.newHandler}}>Click</button>');
    const output = root.toSource();
    expect(output).toContain("this.newHandler");
    expect(output).not.toContain("this.oldHandler");
  });
});

// ── Sub-expressions ──────────────────────────────────────────────────────

describe("Glimmer — sub-expression operations", () => {
  it("finds a sub-expression (helper call in parens)", () => {
    const source = `<template>
  {{#let (hash name="test" age=42) as |data|}}
    <div>{{data.name}}</div>
  {{/let}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const subExprs = root.find("GlimmerSubExpression");
    expect(subExprs.length).toBeGreaterThanOrEqual(1);
  });

  it("finds nested sub-expressions", () => {
    const source = `<template>
  <MyComponent @value={{(concat (uppercase this.first) " " this.last)}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const subExprs = root.find("GlimmerSubExpression");
    expect(subExprs.length).toBeGreaterThanOrEqual(2); // concat + uppercase
  });

  it("finds hash pairs inside sub-expressions", () => {
    const source = `<template>
  {{#let (hash name="test" count=42) as |data|}}
    <span>{{data.name}}</span>
  {{/let}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const hashPairs = root.find("GlimmerHashPair");
    expect(hashPairs.length).toBe(2); // name="test", count=42
  });
});

// ── String and number literals ───────────────────────────────────────────

describe("Glimmer — literal node operations", () => {
  it("finds GlimmerStringLiteral nodes", () => {
    const source = `<template>
  <MyComponent @onClick={{fn this.handle "save"}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const strings = root.find("GlimmerStringLiteral");
    expect(strings.length).toBeGreaterThanOrEqual(1);
  });

  it("finds GlimmerStringLiteral by value", () => {
    const source = `<template>
  <button {{on "click" this.save}}>Save</button>
  <button {{on "submit" this.submit}}>Submit</button>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const clickStr = root.find("GlimmerStringLiteral", { value: "click" });
    expect(clickStr.length).toBe(1);
    const submitStr = root.find("GlimmerStringLiteral", { value: "submit" });
    expect(submitStr.length).toBe(1);
  });

  it("finds GlimmerNumberLiteral nodes", () => {
    const source = `<template>
  {{#let (hash count=42) as |data|}}
    <span>{{data.count}}</span>
  {{/let}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const numbers = root.find("GlimmerNumberLiteral");
    expect(numbers.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Path expression operations ───────────────────────────────────────────

describe("Glimmer — path expression operations", () => {
  it("finds all path expressions in a template", () => {
    const source = `<template>
  {{#if this.show}}
    {{this.greeting}}
    {{this.name}}
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const paths = root.find("GlimmerPathExpression");
    // if, this.show, this.greeting, this.name
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });

  it("finds a specific path expression by original", () => {
    const source = `<template>
  <div>{{this.userName}}</div>
  <div>{{this.email}}</div>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const userName = root.find("GlimmerPathExpression", { original: "this.userName" });
    expect(userName.length).toBe(1);
  });

  it("finds helper path expressions", () => {
    const source = `<template>
  {{#each this.items as |item|}}
    <li>{{item}}</li>
  {{/each}}
  {{#if this.ready}}
    <Ready />
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const eachPath = root.find("GlimmerPathExpression", { original: "each" });
    const ifPath = root.find("GlimmerPathExpression", { original: "if" });
    expect(eachPath.length).toBe(1);
    expect(ifPath.length).toBe(1);
  });

  it("finds the {{yield}} path expression", () => {
    const source = `<template>
  <div class="wrapper">
    {{yield}}
  </div>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    const yieldPaths = root.find("GlimmerPathExpression", { original: "yield" });
    expect(yieldPaths.length).toBe(1);
  });
});

// ── Multiple replacements in one pass ────────────────────────────────────

describe("Glimmer — multiple replacements in one pass", () => {
  it("renames two different components in one file", () => {
    const source = `<template>
  <OldHeader />
  <OldContent>body</OldContent>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerElementNode", { tag: "OldHeader" }).replaceWith("<NewHeader />");
    root
      .find("GlimmerElementNode", { tag: "OldContent" })
      .replaceWith("<NewContent>body</NewContent>");
    const output = root.toSource();
    expect(output).toContain("<NewHeader />");
    expect(output).toContain("<NewContent>body</NewContent>");
    expect(output).not.toContain("OldHeader");
    expect(output).not.toContain("OldContent");
  });

  it("throws on overlapping parent+child replacements (element + its attr)", () => {
    const source = `<template>
  <OldButton @oldLabel={{this.text}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerAttrNode", { name: "@oldLabel" }).replaceWith("@label={{this.text}}");
    root
      .find("GlimmerElementNode", { tag: "OldButton" })
      .replaceWith("<Button @label={{this.text}} />");
    // zmod correctly rejects overlapping parent+child patches
    expect(() => root.toSource()).toThrow(/[Oo]verlapping/);
  });

  it("replaces a parent element to rename both element and argument at once", () => {
    const source = `<template>
  <OldButton @oldLabel={{this.text}} />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    // The correct approach: replace the whole parent element
    root
      .find("GlimmerElementNode", { tag: "OldButton" })
      .replaceWith("<Button @label={{this.text}} />");
    const output = root.toSource();
    expect(output).toContain("<Button");
    expect(output).toContain("@label={{this.text}}");
    expect(output).not.toContain("OldButton");
    expect(output).not.toContain("@oldLabel");
  });

  it("renames multiple named blocks within one component", () => {
    const source = `<template>
  <Card>
    <:oldHeader>Title</:oldHeader>
    <:oldBody>Content</:oldBody>
    <:oldFooter>Actions</:oldFooter>
  </Card>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root.find("GlimmerElementNode", { tag: ":oldHeader" }).replaceWith("<:header>Title</:header>");
    root.find("GlimmerElementNode", { tag: ":oldBody" }).replaceWith("<:body>Content</:body>");
    root
      .find("GlimmerElementNode", { tag: ":oldFooter" })
      .replaceWith("<:footer>Actions</:footer>");
    const output = root.toSource();
    expect(output).toContain("<:header>Title</:header>");
    expect(output).toContain("<:body>Content</:body>");
    expect(output).toContain("<:footer>Actions</:footer>");
    expect(output).not.toContain("oldHeader");
    expect(output).not.toContain("oldBody");
    expect(output).not.toContain("oldFooter");
  });
});

// ── Combined JS + Glimmer operations ─────────────────────────────────────

describe("Glimmer — combined JS and template operations", () => {
  it("renames a class and a template component in one pass", () => {
    const source = `import Component from '@glimmer/component';

export default class OldPage extends Component {
  <template>
    <OldWidget @data={{this.data}} />
  </template>
}
`;
    const root = j(source, { filePath: "page.gjs" });
    root.find(z.Identifier, { name: "OldPage" }).replaceWith("NewPage");
    root
      .find("GlimmerElementNode", { tag: "OldWidget" })
      .replaceWith("<NewWidget @data={{this.data}} />");
    const output = root.toSource();
    expect(output).toContain("class NewPage");
    expect(output).toContain("<NewWidget");
    expect(output).not.toContain("OldPage");
    expect(output).not.toContain("OldWidget");
    expect(output).toContain("import Component");
  });

  it("renames an import and a template component together (.gts)", () => {
    const source = `import Component from '@glimmer/component';
import OldHelper from './helpers/old-helper';

interface Sig {
  Args: { items: string[] };
}

export default class List extends Component<Sig> {
  <template>
    {{#each @items as |item|}}
      <OldCard @title={{item}} />
    {{/each}}
  </template>
}
`;
    const root = j(source, { filePath: "list.gts" });
    root.find(z.Identifier, { name: "OldHelper" }).replaceWith("NewHelper");
    root.find("GlimmerElementNode", { tag: "OldCard" }).replaceWith("<NewCard @title={{item}} />");
    const output = root.toSource();
    expect(output).toContain("import NewHelper");
    expect(output).toContain("<NewCard");
    expect(output).not.toContain("OldHelper");
    expect(output).not.toContain("OldCard");
    expect(output).toContain("interface Sig");
    expect(output).toContain("Component<Sig>");
  });

  it("modifies a JS property name and finds Glimmer mustache using it", () => {
    const source = `const greeting = "Hello";

<template>
  <h1>{{greeting}}</h1>
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    // Find the JS identifier
    const jsIds = root.find(z.Identifier, { name: "greeting" });
    expect(jsIds.length).toBeGreaterThan(0);
    // Find the Glimmer path expression referencing it
    const glimmerPaths = root.find("GlimmerPathExpression", { original: "greeting" });
    expect(glimmerPaths.length).toBe(1);
  });
});

// ── Complex real-world codemod scenarios ─────────────────────────────────

describe("Glimmer — real-world codemod scenarios", () => {
  it("migrates a component API: renames element and restructures named blocks", () => {
    const source = `import Component from '@glimmer/component';

export default class Dashboard extends Component {
  <template>
    <OldPanel @title={{this.title}}>
      Panel content here
    </OldPanel>
  </template>
}
`;
    const root = j(source, { filePath: "dashboard.gjs" });
    root.find("GlimmerElementNode", { tag: "OldPanel" }).replaceWith(
      `<NewPanel>
        <:header>{{this.title}}</:header>
        <:content>Panel content here</:content>
      </NewPanel>`,
    );
    const output = root.toSource();
    expect(output).toContain("<NewPanel>");
    expect(output).toContain("<:header>{{this.title}}</:header>");
    expect(output).toContain("<:content>Panel content here</:content>");
    expect(output).not.toContain("OldPanel");
    expect(output).toContain("class Dashboard");
  });

  it("migrates from string @route to LinkTo with named blocks", () => {
    const source = `<template>
  <LinkTo @route="old-route" @model={{this.model}}>
    Go to page
  </LinkTo>
</template>
`;
    const root = j(source, { filePath: "nav.gjs" });
    root.find("GlimmerElementNode", { tag: "LinkTo" }).replaceWith(
      `<LinkTo @route="new-route" @model={{this.model}}>
      Go to page
    </LinkTo>`,
    );
    const output = root.toSource();
    expect(output).toContain("new-route");
    expect(output).not.toContain("old-route");
  });

  it("renames splattributes component to a new one", () => {
    const source = `<template>
  <OldInput @value={{this.val}} ...attributes />
</template>
`;
    const root = j(source, { filePath: "test.gjs" });
    root
      .find("GlimmerElementNode", { tag: "OldInput" })
      .replaceWith("<NewInput @value={{this.val}} ...attributes />");
    const output = root.toSource();
    expect(output).toContain("<NewInput");
    expect(output).toContain("...attributes");
    expect(output).not.toContain("OldInput");
  });

  it("transforms a template-only component to a class component pattern", () => {
    const source = `<template>
  <h1>{{@title}}</h1>
  <p>{{@body}}</p>
</template>
`;
    const root = j(source, { filePath: "article.gjs" });
    // Verify we can find the @-prefixed argument paths
    const argPaths = root.find("GlimmerPathExpression", { original: "@title" });
    expect(argPaths.length).toBeGreaterThanOrEqual(1);
    const bodyPaths = root.find("GlimmerPathExpression", { original: "@body" });
    expect(bodyPaths.length).toBeGreaterThanOrEqual(1);
  });

  it("handles a .gts file with complex TypeScript and Glimmer interleaving", () => {
    const source = `import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

interface TodoItem {
  id: number;
  text: string;
  done: boolean;
}

interface Signature {
  Args: {
    items: TodoItem[];
    onToggle: (id: number) => void;
  };
}

export default class TodoList extends Component<Signature> {
  @tracked filter: 'all' | 'active' | 'done' = 'all';

  get filteredItems(): TodoItem[] {
    return this.args.items;
  }

  <template>
    <div class="todo-list">
      {{#each this.filteredItems as |item|}}
        <TodoItem @item={{item}} @onToggle={{@onToggle}} />
      {{/each}}
    </div>
  </template>
}
`;
    const root = j(source, { filePath: "todo-list.gts" });
    // Find TS constructs
    const classes = root.find(z.ClassDeclaration);
    expect(classes.length).toBe(1);
    const imports = root.find(z.ImportDeclaration);
    expect(imports.length).toBe(3);
    // Find Glimmer constructs
    const eachBlocks = root.find("GlimmerBlockStatement");
    expect(eachBlocks.length).toBe(1);
    const todoItems = root.find("GlimmerElementNode", { tag: "TodoItem" });
    expect(todoItems.length).toBe(1);
    const blockParams = root.find("GlimmerBlockParam");
    expect(blockParams.length).toBe(1);
    // Rename the component
    root
      .find("GlimmerElementNode", { tag: "TodoItem" })
      .replaceWith("<TodoCard @item={{item}} @onToggle={{@onToggle}} />");
    const output = root.toSource();
    expect(output).toContain("<TodoCard");
    expect(output).not.toContain("<TodoItem");
    // TS should be preserved
    expect(output).toContain("interface TodoItem");
    expect(output).toContain("interface Signature");
    expect(output).toContain("@tracked filter");
    expect(output).toContain("get filteredItems(): TodoItem[]");
  });

  it("counts all Glimmer nodes in a complex template", () => {
    const source = `<template>
  {{#if this.isLoaded}}
    <Header @title={{this.title}} />
    <main>
      {{#each this.items as |item index|}}
        <Card @data={{item}} @index={{index}}>
          <:header>
            <h2>{{item.title}}</h2>
          </:header>
          <:body>
            <p>{{item.description}}</p>
          </:body>
        </Card>
      {{/each}}
    </main>
    <Footer />
  {{else}}
    <LoadingSpinner @size="large" />
  {{/if}}
</template>
`;
    const root = j(source, { filePath: "page.gjs" });
    const elements = root.find("GlimmerElementNode");
    // Header, main, Card, h2, p, Footer, LoadingSpinner, :header, :body
    expect(elements.length).toBeGreaterThanOrEqual(9);
    const attrs = root.find("GlimmerAttrNode");
    // @title, @data, @index, @size
    expect(attrs.length).toBeGreaterThanOrEqual(4);
    const blocks = root.find("GlimmerBlockStatement");
    // #if, #each
    expect(blocks.length).toBe(2);
    const textNodes = root.find("GlimmerTextNode");
    expect(textNodes.length).toBeGreaterThan(0);
    const pathExprs = root.find("GlimmerPathExpression");
    expect(pathExprs.length).toBeGreaterThan(5);
  });
});
