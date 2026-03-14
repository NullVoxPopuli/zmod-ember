import { describe, expect, it } from "vitest";
import { z } from "zmod";
import { emberParser } from "../src/index.js";

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
