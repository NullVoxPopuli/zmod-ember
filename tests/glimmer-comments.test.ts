import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.ts";

const j = z.withParser(emberParser);

// ── HTML comments <!-- --> ─────────────────────────────────────────────

describe("Glimmer — HTML comments (<!-- -->)", () => {
  it("finds an HTML comment in a template", () => {
    const source = `<template><!-- TODO: remove this --><div>content</div></template>`;
    const root = j(source, { filePath: "test.gjs" });

    const comments = root.find("GlimmerCommentStatement");
    expect(comments.length).toBe(1);
    expect(comments.get()?.node.value).toBe(" TODO: remove this ");
  });

  it("replaces the content of an HTML comment", () => {
    const source = `<template><!-- old comment --></template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerCommentStatement").replaceWith("<!-- new comment -->");
    const output = root.toSource();

    expect(output).toContain("<!-- new comment -->");
    expect(output).not.toContain("<!-- old comment -->");
  });

  it("replaces an HTML comment while preserving surrounding elements", () => {
    const source = `<template>
  <header>Header</header>
  <!-- old section comment -->
  <main>Content</main>
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerCommentStatement").replaceWith("<!-- updated section comment -->");
    const output = root.toSource();

    expect(output).toContain("<!-- updated section comment -->");
    expect(output).not.toContain("<!-- old section comment -->");
    expect(output).toContain("<header>Header</header>");
    expect(output).toContain("<main>Content</main>");
  });

  it("replaces one HTML comment among multiple", () => {
    const source = `<template>
  <!-- first comment -->
  <div>content</div>
  <!-- second comment -->
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root
      .find("GlimmerCommentStatement")
      .filter((path) => path.node.value.includes("first"))
      .replaceWith("<!-- replaced first comment -->");
    const output = root.toSource();

    expect(output).toContain("<!-- replaced first comment -->");
    expect(output).toContain("<!-- second comment -->");
    expect(output).not.toContain("<!-- first comment -->");
  });

  it("removes an HTML comment by replacing with empty string", () => {
    const source = `<template><!-- temporary --><span>text</span></template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerCommentStatement").replaceWith("");
    const output = root.toSource();

    expect(output).not.toContain("<!--");
    expect(output).toContain("<span>text</span>");
  });

  it("finds HTML comment value by matching on node properties", () => {
    const source = `<template>
  <!-- keep this -->
  <!-- remove this -->
  <div>content</div>
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    const found = root.find("GlimmerCommentStatement", { value: " remove this " });
    expect(found.length).toBe(1);
  });

  it("does not find HTML comments when only mustache comments exist", () => {
    const source = `<template>{{! a mustache comment }}<div>content</div></template>`;
    const root = j(source, { filePath: "test.gjs" });

    expect(root.find("GlimmerCommentStatement").length).toBe(0);
  });
});

// ── Short mustache comments {{! }} ────────────────────────────────────

describe("Glimmer — short mustache comments ({{! }})", () => {
  it("finds a short mustache comment in a template", () => {
    const source = `<template>{{! TODO: fix this }}<div>content</div></template>`;
    const root = j(source, { filePath: "test.gjs" });

    const comments = root.find("GlimmerMustacheCommentStatement");
    expect(comments.length).toBe(1);
    expect(comments.get()?.node.value).toBe(" TODO: fix this ");
  });

  it("replaces the content of a short mustache comment", () => {
    const source = `<template>{{! old comment }}<div>content</div></template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerMustacheCommentStatement").replaceWith("{{! new comment }}");
    const output = root.toSource();

    expect(output).toContain("{{! new comment }}");
    expect(output).not.toContain("{{! old comment }}");
  });

  it("replaces a short mustache comment while preserving surrounding elements", () => {
    const source = `<template>
  <header>Header</header>
  {{! old section label }}
  <main>Content</main>
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerMustacheCommentStatement").replaceWith("{{! updated section label }}");
    const output = root.toSource();

    expect(output).toContain("{{! updated section label }}");
    expect(output).not.toContain("{{! old section label }}");
    expect(output).toContain("<header>Header</header>");
    expect(output).toContain("<main>Content</main>");
  });

  it("replaces a short mustache comment with a long-form one", () => {
    const source = `<template>{{! short form }}</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerMustacheCommentStatement").replaceWith("{{!-- now long form --}}");
    const output = root.toSource();

    expect(output).toContain("{{!-- now long form --}}");
    expect(output).not.toContain("{{! short form }}");
  });

  it("removes a short mustache comment by replacing with empty string", () => {
    const source = `<template>{{! placeholder }}<span>text</span></template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerMustacheCommentStatement").replaceWith("");
    const output = root.toSource();

    expect(output).not.toContain("{{!");
    expect(output).toContain("<span>text</span>");
  });
});

// ── Long mustache comments {{!-- --}} ─────────────────────────────────

describe("Glimmer — long mustache comments ({{!-- --}})", () => {
  it("finds a long-form mustache comment in a template", () => {
    const source = `<template>{{!-- multi-word comment --}}<div>content</div></template>`;
    const root = j(source, { filePath: "test.gjs" });

    const comments = root.find("GlimmerMustacheCommentStatement");
    expect(comments.length).toBe(1);
    expect(comments.get()?.node.value).toBe(" multi-word comment ");
  });

  it("replaces the content of a long-form mustache comment", () => {
    const source = `<template>{{!-- old content --}}</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerMustacheCommentStatement").replaceWith("{{!-- new content --}}");
    const output = root.toSource();

    expect(output).toContain("{{!-- new content --}}");
    expect(output).not.toContain("{{!-- old content --}}");
  });

  it("replaces a long-form mustache comment while preserving surrounding elements", () => {
    const source = `<template>
  <header>Header</header>
  {{!-- section: main content area --}}
  <main>Content</main>
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root
      .find("GlimmerMustacheCommentStatement")
      .replaceWith("{{!-- section: updated main content area --}}");
    const output = root.toSource();

    expect(output).toContain("{{!-- section: updated main content area --}}");
    expect(output).not.toContain("{{!-- section: main content area --}}");
    expect(output).toContain("<header>Header</header>");
    expect(output).toContain("<main>Content</main>");
  });

  it("replaces a long-form comment with a short-form one", () => {
    const source = `<template>{{!-- was long --}}</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerMustacheCommentStatement").replaceWith("{{! now short }}");
    const output = root.toSource();

    expect(output).toContain("{{! now short }}");
    expect(output).not.toContain("{{!-- was long --}}");
  });

  it("finds long-form comment by source slice when distinguishing from short form", () => {
    const source = `<template>{{! short form }}{{!-- long form --}}</template>`;
    const root = j(source, { filePath: "test.gjs" });

    const longFormComments = root
      .find("GlimmerMustacheCommentStatement")
      .filter((path) => source.slice(path.node.start, path.node.end).startsWith("{{!--"));

    expect(longFormComments.length).toBe(1);
    expect(longFormComments.get()?.node.value).toBe(" long form ");

    longFormComments.replaceWith("{{!-- updated long form --}}");
    const output = root.toSource();

    expect(output).toContain("{{! short form }}");
    expect(output).toContain("{{!-- updated long form --}}");
    expect(output).not.toContain("{{!-- long form --}}");
  });
});

// ── Mixed comment types ────────────────────────────────────────────────

describe("Glimmer — mixed comment types", () => {
  it("finds HTML and mustache comments separately", () => {
    const source = `<template>
  <!-- html comment -->
  {{! short mustache }}
  {{!-- long mustache --}}
  <div>content</div>
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    const htmlComments = root.find("GlimmerCommentStatement");
    const mustacheComments = root.find("GlimmerMustacheCommentStatement");

    expect(htmlComments.length).toBe(1);
    expect(mustacheComments.length).toBe(2);
  });

  it("replaces only HTML comments leaving mustache comments intact", () => {
    const source = `<template>
  <!-- html comment -->
  {{! mustache comment }}
  <div>content</div>
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerCommentStatement").replaceWith("<!-- updated html comment -->");
    const output = root.toSource();

    expect(output).toContain("<!-- updated html comment -->");
    expect(output).toContain("{{! mustache comment }}");
    expect(output).not.toContain("<!-- html comment -->");
  });

  it("replaces only mustache comments leaving HTML comments intact", () => {
    const source = `<template>
  <!-- html comment -->
  {{! mustache comment }}
  <div>content</div>
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerMustacheCommentStatement").replaceWith("{{! updated mustache comment }}");
    const output = root.toSource();

    expect(output).toContain("{{! updated mustache comment }}");
    expect(output).toContain("<!-- html comment -->");
    expect(output).not.toContain("{{! mustache comment }}");
  });

  it("replaces all comment types in one pass", () => {
    const source = `<template>
  <!-- html comment -->
  {{! short mustache }}
  {{!-- long mustache --}}
  <div>content</div>
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerCommentStatement").replaceWith("<!-- updated html -->");
    root.find("GlimmerMustacheCommentStatement").replaceWith("{{! updated mustache }}");
    const output = root.toSource();

    expect(output).toContain("<!-- updated html -->");
    expect(output).not.toContain("<!-- html comment -->");
    expect(output).not.toContain("{{! short mustache }}");
    expect(output).not.toContain("{{!-- long mustache --}}");
    expect(output).toContain("<div>content</div>");
  });

  it("targets short {{! }} and long {{!-- --}} mustache comments individually", () => {
    const root = j(`<template>{{! short }}{{!-- long --}}</template>`, { filePath: "test.gjs" });

    root
      .find("GlimmerMustacheCommentStatement")
      .filter((path) => !path.node.longForm)
      .replaceWith("{{! updated short }}");

    root
      .find("GlimmerMustacheCommentStatement")
      .filter((path) => path.node.longForm)
      .replaceWith("{{!-- updated long --}}");

    const output = root.toSource();
    expect(output).toContain("{{! updated short }}");
    expect(output).toContain("{{!-- updated long --}}");
    expect(output).not.toContain("{{! short }}");
    expect(output).not.toContain("{{!-- long --}}");
  });

  it("handles comments inside a class-based component in .gjs", () => {
    const source = `import Component from '@glimmer/component';

export default class MyPage extends Component {
  <template>
    <!-- page header -->
    {{! page body }}
    <main>Content</main>
  </template>
}
`;
    const root = j(source, { filePath: "page.gjs" });

    root.find("GlimmerCommentStatement").replaceWith("<!-- updated page header -->");
    root.find("GlimmerMustacheCommentStatement").replaceWith("{{! updated page body }}");
    const output = root.toSource();

    expect(output).toContain("<!-- updated page header -->");
    expect(output).toContain("{{! updated page body }}");
    expect(output).not.toContain("<!-- page header -->");
    expect(output).not.toContain("{{! page body }}");
    expect(output).toContain("import Component");
    expect(output).toContain("export default class MyPage");
    expect(output).toContain("<main>Content</main>");
  });

  it("handles comments nested inside a block expression", () => {
    const source = `<template>
  {{#if this.show}}
    <!-- conditional html comment -->
    {{! conditional mustache comment }}
    <div>shown</div>
  {{/if}}
</template>`;
    const root = j(source, { filePath: "test.gjs" });

    root.find("GlimmerCommentStatement").replaceWith("<!-- updated html -->");
    root.find("GlimmerMustacheCommentStatement").replaceWith("{{! updated mustache }}");
    const output = root.toSource();

    expect(output).toContain("<!-- updated html -->");
    expect(output).toContain("{{! updated mustache }}");
    expect(output).toContain("{{#if this.show}}");
    expect(output).toContain("<div>shown</div>");
  });
});
