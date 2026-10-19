import { describe, expect, it } from "vitest";
import { loadInline } from "./helpers.ts";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect id="bg" width="10" height="10"/></svg>`;
const box = { x: 100, y: 100, width: 100, height: 100 };
const cross = { id: "cross", type: "button", bindings: ["cross"], svg: "c.svg", box, elements: { bg: { role: "base" } } };
const menu = { id: "menu", type: "system", action: "menu", svg: "c.svg", box, elements: { bg: { role: "base" } } };
const skin = (extra: object) => ({ format: 1, name: "Warn", author: "Tests", version: "1.0.0", orientation: "landscape", preview: "p.png", controls: [cross, menu], ...extra });
const files = { "c.svg": SVG, "p.png": new Uint8Array([1]) };

async function entries(manifest: object, extraFiles: Record<string, string | Uint8Array> = {}) {
  const result = await loadInline(manifest, { ...files, ...extraFiles });
  expect(result.ok).toBe(true); // warnings and notes never block loading
  return result.report;
}

describe("warnings and notes", () => {
  it("a complete skin has none", async () => {
    expect(await entries(skin({}))).toEqual([]);
  });

  it("warns when there is no menu", async () => {
    expect(await entries(skin({ controls: [cross] }))).toContainEqual({ severity: "warning", code: "no-menu", params: {} });
  });

  it("warns about controls outside the canvas", async () => {
    const outside = { ...cross, id: "far", box: { x: 1550, y: 700, width: 100, height: 100 } };
    expect(await entries(skin({ controls: [cross, outside, menu] }))).toContainEqual({ severity: "warning", code: "outside-canvas", params: { control: "far" } });
  });

  it("warns about unknown top-level fields", async () => {
    expect(await entries(skin({ theme: "dark" }))).toContainEqual({ severity: "warning", code: "unknown-field", params: { field: "theme" } });
  });

  it("warns when a grouped control declares its own anchor", async () => {
    const anchored = { ...cross, anchor: "left" };
    expect(await entries(skin({ controls: [anchored, menu], groups: [{ name: "g", anchor: "right", controls: ["cross"] }] })))
      .toContainEqual({ severity: "warning", code: "anchor-ignored", params: { control: "cross", group: "g" } });
  });

  it("notes a missing preview", async () => {
    const { preview: _p, ...noPreview } = skin({});
    expect(await entries(noPreview)).toContainEqual({ severity: "info", code: "no-preview", params: {} });
  });

  it("notes files the skin does not use", async () => {
    expect(await entries(skin({}), { "old/draft.svg": SVG })).toContainEqual({ severity: "info", code: "unused-file", params: { file: "old/draft.svg" } });
  });
});
