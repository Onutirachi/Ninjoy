import { describe, expect, it } from "vitest";
import type { ResolvedSkin } from "../src/index.ts";
import { codes, loadInline } from "./helpers.ts";

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="bg" width="100" height="100"/><rect id="mark" x="40" y="40" width="20" height="20"/></svg>';
const STICK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="ring" cx="50" cy="50" r="50"/><circle id="ball" cx="50" cy="50" r="20"/></svg>';
const files = { "a.svg": SQUARE, "s.svg": STICK };

const menu = { id: "menu", type: "system", action: "menu", svg: "a.svg", box: { x: 750, y: 600, width: 100, height: 100 }, elements: { bg: { role: "base" } } };

function manifest(format: number, extra: Record<string, unknown> = {}, controls: object[] = []) {
  return {
    format,
    name: "Test",
    author: "Ninjoy",
    version: "1.0.0",
    orientation: "landscape",
    controls: [menu, ...controls],
    ...extra,
  };
}

async function ok(m: object): Promise<ResolvedSkin> {
  const result = await loadInline(m, files);
  expect(result.report.filter((e) => e.severity === "error")).toEqual([]);
  if (!result.ok) throw new Error("did not load");
  return result.skin;
}

const button = (id: string, x: number, more: object = {}) => ({ id, type: "button", bindings: ["cross"], svg: "a.svg", box: { x, y: 100, width: 100, height: 100 }, elements: { bg: { role: "base" } }, ...more });
const stick = (id: string, x: number, more: object = {}) => ({ id, type: "stick", side: "left", svg: "s.svg", box: { x, y: 300, width: 200, height: 200 }, elements: { ring: { role: "base" }, ball: { role: "thumb" } }, ...more });

describe("skin format 2", () => {
  it("accepts format 2 and reports it", async () => {
    const skin = await ok(manifest(2, {}, [button("x", 100)]));
    expect(skin.meta.format).toBe(2);
  });

  it("keeps format 1 skins as they were", async () => {
    const skin = await ok(manifest(1, {}, [button("x", 100)]));
    expect(skin.meta.format).toBe(1);
    expect(skin.controls.find((c) => c.id === "x")!.fixed).toBe(false);
  });

  it("rejects formats this version does not know", async () => {
    expect(codes(await loadInline(manifest(3), files))).toContain("unsupported-format");
  });

  it("resolves original and lightbar colors", async () => {
    const skin = await ok(
      manifest(2, { defaults: { colors: { base: { inactive: "#112233", active: "#445566" } } } }, [
        button("x", 100, { elements: { bg: { role: "base", colors: { inactive: "original", active: "lightbar" } }, mark: { colors: { inactive: "lightbar 40%" } } } }),
      ]),
    );
    const els = Object.fromEntries(skin.controls.find((c) => c.id === "x")!.elements.map((e) => [e.id, e.colors]));
    expect(els.bg).toEqual({ inactive: null, active: "var(--ninjoy-lightbar)" });
    expect(els.mark!.inactive).toBe("color-mix(in srgb, var(--ninjoy-lightbar) 40%, transparent)");
  });

  it("refuses badly written lightbar colors", async () => {
    const result = await loadInline(manifest(2, {}, [button("x", 100, { elements: { bg: { role: "base", colors: { inactive: "lightbar 140%" } } } })]), files);
    expect(codes(result)).toContain("schema-invalid-value");
  });

  it("draws decorations without a touch area or bindings", async () => {
    const skin = await ok(manifest(2, {}, [{ id: "bar", type: "decor", svg: "a.svg", box: { x: 700, y: 0, width: 200, height: 20 }, elements: { bg: { colors: { inactive: "lightbar" } } } }]));
    const bar = skin.controls.find((c) => c.id === "bar")!;
    expect(bar.type).toBe("decor");
    expect(bar.bindings).toBeUndefined();
  });

  it("refuses bindings on a decoration", async () => {
    const result = await loadInline(manifest(2, {}, [{ id: "bar", type: "decor", bindings: ["cross"], svg: "a.svg", box: { x: 700, y: 0, width: 200, height: 20 } }]), files);
    expect(codes(result)).toContain("schema-unexpected-field");
  });

  it("makes fixed controls their own fixed groups and fixed groups when all members are fixed", async () => {
    const skin = await ok(
      manifest(2, { groups: [{ name: "pair", controls: ["a", "b"] }, { name: "mixed", controls: ["c"] }] }, [
        button("a", 100, { fixed: true }),
        button("b", 300, { fixed: true }),
        button("c", 500),
        button("d", 1300, { fixed: true }),
      ]),
    );
    const group = (name: string) => skin.groups.find((g) => g.name === name)!;
    expect(group("pair").fixed).toBe(true);
    expect(group("mixed").fixed).toBe(false);
    expect(group("d").fixed).toBe(true);
    expect(skin.controls.find((c) => c.id === "d")!.fixed).toBe(true);
  });

  it("refuses a group mixing fixed and resizing controls", async () => {
    const result = await loadInline(manifest(2, { groups: [{ name: "pair", controls: ["a", "b"] }] }, [button("a", 100, { fixed: true }), button("b", 300)]), files);
    expect(codes(result)).toContain("fixed-mixed-group");
  });

  it("lets sticks send the d-pad, from the skin default or each stick", async () => {
    const skin = await ok(
      manifest(2, { defaults: { stick: { output: "dpad" } } }, [stick("lever", 100), stick("analog", 600, { side: "right", output: "analog" })]),
    );
    const out = (id: string) => skin.controls.find((c) => c.id === id)!.stick!.output;
    expect(out("lever")).toBe("dpad");
    expect(out("analog")).toBe("analog");
    const plain = await ok(manifest(2, {}, [stick("s", 100)]));
    expect(plain.controls.find((c) => c.id === "s")!.stick!.output).toBe("analog");
  });

  it("refuses format 2 features in a format 1 skin", async () => {
    for (const m of [
      manifest(1, {}, [button("a", 100, { fixed: true })]),
      manifest(1, {}, [{ id: "bar", type: "decor", svg: "a.svg", box: { x: 700, y: 0, width: 200, height: 20 } }]),
      manifest(1, {}, [stick("s", 100, { output: "dpad" })]),
      manifest(1, { defaults: { stick: { output: "dpad" } } }, [stick("s", 100)]),
      manifest(1, {}, [button("a", 100, { elements: { bg: { role: "base", colors: { active: "lightbar" } } } })]),
    ]) {
      expect(codes(await loadInline(m, files))).toContain("needs-format-2");
    }
  });
});
