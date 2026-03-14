import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

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
