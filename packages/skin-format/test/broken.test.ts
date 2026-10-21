import { describe, expect, it } from "vitest";
import type { ReportEntry } from "../src/index.ts";
import { loadInline } from "./helpers.ts";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect id="bg" width="10" height="10"/><circle id="ball" r="2"/></svg>`;
const box = { x: 100, y: 100, width: 100, height: 100 };
const button = (id: string, extra: object = {}) => ({ id, type: "button", bindings: ["cross"], svg: "c.svg", box, elements: { bg: { role: "base" } }, ...extra });
const menu = { id: "menu", type: "system", action: "menu", svg: "c.svg", box, elements: { bg: { role: "base" } } };
const skin = (extra: object) => ({ format: 1, name: "Broken", author: "Tests", version: "1.0.0", orientation: "landscape", preview: "p.png", controls: [button("cross"), menu], ...extra });
const files = { "c.svg": SVG, "p.png": new Uint8Array([1]) };

const CASES: [name: string, manifest: object, expected: Partial<ReportEntry>][] = [
  ["unknown binding", skin({ controls: [button("cross", { bindings: ["crss"] }), menu] }),
    { code: "schema-invalid-value", params: { field: "/controls/0/bindings/0", value: "crss" } }],
  ["missing SVG file", skin({ controls: [button("cross", { svg: "nope.svg" }), menu] }),
    { code: "missing-file", params: { file: "nope.svg", control: "cross" } }],
  ["missing preview file", skin({ preview: "missing.png" }),
    { code: "missing-file", params: { file: "missing.png" } }],
  ["newer format", skin({ format: 3 }),
    { code: "unsupported-format", params: { value: 3 } }],
  ["duplicate control id", skin({ controls: [button("cross"), button("cross"), menu] }),
    { code: "duplicate-control", params: { control: "cross" } }],
  ["group with unknown control", skin({ groups: [{ name: "g", controls: ["ghost"] }] }),
    { code: "unknown-control", params: { group: "g", control: "ghost" } }],
  ["control in two groups", skin({ groups: [{ name: "a", controls: ["cross"] }, { name: "b", controls: ["cross"] }] }),
    { code: "control-in-two-groups", params: { control: "cross", group: "b" } }],
  ["duplicate group", skin({ groups: [{ name: "a", controls: ["cross"] }, { name: "a", controls: ["menu"] }] }),
    { code: "duplicate-group", params: { group: "a" } }],
  ["stick zones that leave no travel", skin({ controls: [{ id: "s", type: "stick", side: "left", svg: "c.svg", box, elements: { bg: { role: "base" }, ball: { role: "thumb" } }, tuning: { deadZone: 0.6, maxZone: 0.4 } }, menu] }),
    { code: "invalid-tuning", params: { control: "s" } }],
  ["trigger that is all 100% zone", skin({ controls: [{ id: "t", type: "trigger", trigger: "l2", svg: "c.svg", box, elements: { bg: { role: "base" } }, tuning: { maxZone: 1 } }, menu] }),
    { code: "invalid-tuning", params: { control: "t" } }],
  ["path leaving the package", skin({ controls: [button("cross", { svg: "../x.svg" }), menu] }),
    { code: "schema-invalid-value", params: { field: "/controls/0/svg", value: "../x.svg" } }],
];

describe("broken skins", () => {
  for (const [name, manifest, expected] of CASES) {
    it(`reports ${name}`, async () => {
      const result = await loadInline(manifest, files);
      expect(result.ok).toBe(false);
      expect(result.report).toContainEqual(expect.objectContaining({ severity: "error", ...expected, params: expect.objectContaining(expected.params) }));
    });
  }
});
