import { describe, expect, it } from "vitest";
import { filesFromMap, loadSkin } from "../src/index.ts";
import { OFFICIAL_SKIN, readSkinFolder } from "./helpers.ts";

describe("performance", () => {
  it("loads the official skin in under 50 ms on average", async () => {
    const files = filesFromMap(readSkinFolder(OFFICIAL_SKIN));
    await loadSkin(files); // warm-up (module and schema compilation)
    const runs = 20;
    const start = performance.now();
    for (let i = 0; i < runs; i++) await loadSkin(files);
    const average = (performance.now() - start) / runs;
    expect(average).toBeLessThan(50);
  });
});
