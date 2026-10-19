import { describe, expect, it } from "vitest";
import { filesFromMap, loadSkin, MAX_PACKAGE_BYTES } from "../src/index.ts";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="bg" cx="50" cy="50" r="50"/></svg>`;
const manifest = (extra: Record<string, unknown> = {}) => ({
  format: 1, name: "Basic", author: "Tests", version: "1.0.0", orientation: "landscape",
  controls: [{ id: "cross", type: "button", bindings: ["cross"], svg: "cross.svg", box: { x: 100, y: 100, width: 100, height: 100 }, elements: { bg: { role: "base" } } }],
  ...extra,
});
const codes = (r: { report: { code: string }[] }) => r.report.map((e) => e.code);

describe("loadSkin basics", () => {
  it("loads a minimal valid package", async () => {
    const result = await loadSkin(filesFromMap({ "skin.json": JSON.stringify(manifest()), "cross.svg": svg }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skin.controls).toHaveLength(1);
      expect(result.skin.controls[0]?.bindings).toEqual(["cross"]);
      expect(result.skin.controls[0]?.svg.text).toBe(svg);
    }
  });

  it("reports a missing manifest", async () => {
    expect(codes(await loadSkin(filesFromMap({ "cross.svg": svg })))).toEqual(["missing-manifest"]);
  });

  it("reports invalid JSON", async () => {
    expect(codes(await loadSkin(filesFromMap({ "skin.json": "{nope" })))).toEqual(["invalid-json"]);
  });

  it("reports schema problems with the field", async () => {
    const result = await loadSkin(filesFromMap({ "skin.json": JSON.stringify(manifest({ orientation: "portrait" })), "cross.svg": svg }));
    expect(result.ok).toBe(false);
    expect(result.report).toContainEqual({ severity: "error", code: "schema-invalid-value", params: { field: "/orientation", value: "portrait" } });
  });

  it("reports a missing required field", async () => {
    const { name: _name, ...noName } = manifest();
    const result = await loadSkin(filesFromMap({ "skin.json": JSON.stringify(noName), "cross.svg": svg }));
    expect(result.report).toContainEqual({ severity: "error", code: "schema-missing-field", params: { field: "/name" } });
  });

  it("reports a missing SVG file", async () => {
    const result = await loadSkin(filesFromMap({ "skin.json": JSON.stringify(manifest()) }));
    expect(result.report).toContainEqual({ severity: "error", code: "missing-file", params: { file: "cross.svg", control: "cross" } });
  });

  it("reports an SVG that is not well-formed", async () => {
    const result = await loadSkin(filesFromMap({ "skin.json": JSON.stringify(manifest()), "cross.svg": "<svg><g></svg>" }));
    expect(codes(result)).toEqual(["invalid-svg"]);
  });

  it("rejects packages over the size limit", async () => {
    const big = new Uint8Array(MAX_PACKAGE_BYTES + 1);
    const result = await loadSkin(filesFromMap({ "skin.json": JSON.stringify(manifest()), "cross.svg": svg, "big.png": big }));
    expect(codes(result)).toEqual(["package-too-large"]);
  });
});
