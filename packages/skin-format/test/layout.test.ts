import { describe, expect, it } from "vitest";
import type { ResolvedSkin } from "../src/index.ts";
import { loadInline } from "./helpers.ts";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect id="bg" width="10" height="10"/></svg>`;
const at = (id: string, x: number, extra: object = {}) =>
  ({ id, type: "button", bindings: ["cross"], svg: "c.svg", box: { x, y: 300, width: 100, height: 100 }, elements: { bg: { role: "base" } }, ...extra });
const menu = at("menu", 750, { type: "system", action: "menu", bindings: undefined });

async function resolve(extra: object): Promise<ResolvedSkin> {
  const manifest = { format: 1, name: "Layout", author: "Tests", version: "1.0.0", orientation: "landscape", controls: [menu], ...extra };
  const result = await loadInline(manifest, { "c.svg": SVG, "bg.svg": SVG });
  if (!result.ok) throw new Error(JSON.stringify(result.report));
  return result.skin;
}
const anchorOf = (skin: ResolvedSkin, id: string) => skin.controls.find((c) => c.id === id)?.anchor;

describe("anchors and groups", () => {
  it("applies a group's anchor to all its controls", async () => {
    const skin = await resolve({ controls: [at("a", 0), at("b", 1500), menu], groups: [{ name: "g", anchor: "right", controls: ["a", "b"] }] });
    expect([anchorOf(skin, "a"), anchorOf(skin, "b")]).toEqual(["right", "right"]);
    expect(skin.groups).toContainEqual({ name: "g", anchor: "right", controls: ["a", "b"] });
  });

  it("derives the anchor of an ungrouped control from its position (thirds)", async () => {
    // centers: 150 (left third), 800 (middle), 1450 (right third); the third boundaries are 533.3 and 1066.7
    const skin = await resolve({ controls: [at("l", 100), at("m", 750), at("r", 1400), at("menu", 1000, { type: "system", action: "menu", bindings: undefined })] });
    expect([anchorOf(skin, "l"), anchorOf(skin, "m"), anchorOf(skin, "r")]).toEqual(["left", "center", "right"]);
  });

  it("uses a control's own anchor when it is not grouped", async () => {
    const skin = await resolve({ controls: [at("c", 100, { anchor: "right" }), menu] });
    expect(anchorOf(skin, "c")).toBe("right");
  });

  it("derives a group's anchor from the union of its controls' boxes", async () => {
    // union spans 1200..1600 → center 1400 → right third
    const skin = await resolve({ controls: [at("a", 1200), at("b", 1500), menu], groups: [{ name: "g", controls: ["a", "b"] }] });
    expect(anchorOf(skin, "a")).toBe("right");
    expect(skin.controls.find((c) => c.id === "a")?.group).toBe("g");
  });

  it("puts every ungrouped control in an implicit group named after it", async () => {
    const skin = await resolve({ controls: [at("solo", 100), menu] });
    expect(skin.groups).toContainEqual({ name: "solo", anchor: "left", controls: ["solo"] });
    expect(skin.controls.find((c) => c.id === "solo")?.group).toBe("solo");
  });
});

describe("background", () => {
  it("is null when the skin declares none", async () => {
    expect((await resolve({})).background).toBeNull();
  });

  it("resolves declared values", async () => {
    const skin = await resolve({ background: { color: "#102030", image: "bg.svg", placement: "center", opacity: 0.3 } });
    expect(skin.background).toEqual({ color: "#102030", image: "bg.svg", placement: "center", opacity: 0.3 });
  });

  it("fills defaults", async () => {
    expect((await resolve({ background: {} })).background).toEqual({ color: "#000000", placement: "cover", opacity: 1 });
  });
});
