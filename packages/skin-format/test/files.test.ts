import { describe, expect, it } from "vitest";
import { filesFromMap } from "../src/files.ts";

describe("filesFromMap", () => {
  const files = filesFromMap({ "skin.json": "{}", "controls\\a.svg": new Uint8Array([60, 115]) });

  it("lists paths with forward slashes", () => {
    expect(files.list().sort()).toEqual(["controls/a.svg", "skin.json"]);
  });

  it("reads strings as UTF-8 and bytes as-is", async () => {
    expect(new TextDecoder().decode(await files.read("skin.json"))).toBe("{}");
    expect([...(await files.read("controls/a.svg"))]).toEqual([60, 115]);
  });

  it("rejects missing paths", async () => {
    await expect(files.read("nope.svg")).rejects.toThrow();
  });
});
