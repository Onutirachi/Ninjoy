import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filesFromMap, loadSkin } from "../src/index.ts";

// The "Complete example" of the author documentation must stay a valid, copy-paste skin.
describe("documentation example", () => {
  it("is a complete, valid skin", async () => {
    const doc = readFileSync(new URL("../../../docs/skins/format.md", import.meta.url), "utf8");
    const section = doc.slice(doc.indexOf("## 9. Complete example"), doc.indexOf("## 10."));
    const blocks = [...section.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1], body: m[2] ?? "" }));
    const names = [...section.matchAll(/`(controls\/[\w-]+\.svg)`:/g)].map((m) => m[1] ?? "");
    const svgs = blocks.filter((b) => b.lang === "xml");
    const files: Record<string, string> = { "skin.json": blocks.find((b) => b.lang === "json")?.body ?? "" };
    names.forEach((name, i) => { files[name] = svgs[i]?.body ?? ""; });

    const result = await loadSkin(filesFromMap(files));
    expect(result.report.filter((e) => e.severity !== "info")).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
