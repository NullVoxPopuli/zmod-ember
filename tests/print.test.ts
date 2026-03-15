import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

describe("emberParser.print()", () => {
  const j = z.withParser(emberParser);

  it("prints an Identifier node", () => {
    expect(j.print(z.identifier("foo"))).toBe("foo");
  });

  it("prints a CallExpression node", () => {
    const node = z.callExpression(z.identifier("foo"), [z.identifier("a"), z.identifier("b")]);
    expect(j.print(node)).toBe("foo(a, b)");
  });

  it("prints a MemberExpression node", () => {
    const node = z.memberExpression(z.identifier("obj"), z.identifier("method"));
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
