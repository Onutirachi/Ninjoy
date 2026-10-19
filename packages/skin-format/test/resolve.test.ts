import { describe, expect, it } from "vitest";
import type { ResolvedControl, ResolvedSkin } from "../src/index.ts";
import { loadInline } from "./helpers.ts";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <rect id="bg" width="10" height="10"/>
  <g id="icon"><path id="icon-a" d="M1 1h2v2z"/><path id="icon-b" d="M5 5h2v2z"/></g>
  <circle id="ball" cx="5" cy="5" r="2"/><text id="ball-text" x="5" y="5">L3</text>
</svg>`;
const box = { x: 100, y: 100, width: 100, height: 100 };
const control = (id: string, extra: object) => ({ id, svg: "c.svg", box, ...extra });
const menu = control("menu", { type: "system", action: "menu", elements: { bg: { role: "base" } } });

async function resolve(controls: object[], defaults?: object): Promise<ResolvedSkin> {
  const manifest = { format: 1, name: "Colors", author: "Tests", version: "1.0.0", orientation: "landscape", ...(defaults ? { defaults } : {}), controls: [...controls, menu] };
  const result = await loadInline(manifest, { "c.svg": SVG });
  if (!result.ok) throw new Error(JSON.stringify(result.report));
  return result.skin;
}
const find = (skin: ResolvedSkin, id: string) => skin.controls.find((c) => c.id === id) as ResolvedControl;
const colorsOf = (c: ResolvedControl, element: string) => c.elements.find((e) => e.id === element)?.colors;

describe("element colors", () => {
  const defaults = { colors: { base: { inactive: "#111111", active: "#222222" }, label: { active: "#FFFFFF" } } };

  it("inherits each state independently from the role default", async () => {
    const skin = await resolve([control("x", { type: "button", bindings: ["cross"], elements: { bg: { role: "base", colors: { active: "#ABCDEF" } } } })], defaults);
    expect(colorsOf(find(skin, "x"), "bg")).toEqual({ inactive: "#111111", active: "#ABCDEF" });
  });

  it("keeps the SVG colors when nothing is declared", async () => {
    const skin = await resolve([control("x", { type: "button", bindings: ["cross"], elements: { bg: { role: "base" } } })]);
    expect(colorsOf(find(skin, "x"), "bg")).toEqual({ inactive: null, active: null });
  });

  it("treats \"inherit\" like an omitted value", async () => {
    const skin = await resolve([control("x", { type: "button", bindings: ["cross"], elements: { bg: { role: "base", colors: { inactive: "inherit", active: "inherit" } } } })], defaults);
    expect(colorsOf(find(skin, "x"), "bg")).toEqual({ inactive: "#111111", active: "#222222" });
  });

  it("lets a descendant inherit its group's colors unless it has its own", async () => {
    const skin = await resolve([control("x", {
      type: "button", bindings: ["cross"],
      elements: { bg: { role: "base" }, icon: { role: "label", colors: { inactive: "#333333" } }, "icon-a": {}, "icon-b": { colors: { inactive: "#444444" } } },
    })], defaults);
    const x = find(skin, "x");
    expect(colorsOf(x, "icon-a")).toEqual({ inactive: "#333333", active: "#FFFFFF" });
    expect(colorsOf(x, "icon-b")).toEqual({ inactive: "#444444", active: "#FFFFFF" });
    expect(x.elements.find((e) => e.id === "icon-a")?.role).toBe("label");
  });

  it("colors thumb labels with the label defaults", async () => {
    const skin = await resolve([control("s", { type: "stick", side: "left", elements: { bg: { role: "base" }, ball: { role: "thumb" }, "ball-text": { role: "thumb-label" } } })], defaults);
    expect(colorsOf(find(skin, "s"), "ball-text")).toEqual({ inactive: null, active: "#FFFFFF" });
  });
});

describe("trigger appearance", () => {
  const trigger = (extra: object = {}) => control("t", { type: "trigger", trigger: "l2", elements: { bg: { role: "base" } }, ...extra });

  it("uses the built-in fill and lets the 100% zone follow the fill", async () => {
    expect(find(await resolve([trigger()]), "t").trigger).toMatchObject({ fill: "#3099E8", maxZone: "#3099E8", showFill: true });
  });

  it("lets the 100% zone follow a custom fill and be set independently", async () => {
    expect(find(await resolve([trigger({ colors: { fill: "#00FF00" } })]), "t").trigger).toMatchObject({ fill: "#00FF00", maxZone: "#00FF00" });
    expect(find(await resolve([trigger({ colors: { fill: "#00FF00", maxZone: "#FF0000" } })]), "t").trigger).toMatchObject({ fill: "#00FF00", maxZone: "#FF0000" });
  });

  it("resolves showFill from the control, then the defaults", async () => {
    expect(find(await resolve([trigger()], { trigger: { showFill: false } }), "t").trigger?.showFill).toBe(false);
    expect(find(await resolve([trigger({ showFill: true })], { trigger: { showFill: false } }), "t").trigger?.showFill).toBe(true);
  });

  it("resolves tuning from the control, then the defaults, then built-in values", async () => {
    expect(find(await resolve([trigger()]), "t").trigger?.tuning).toEqual({ maxZone: 0.25, minForce: 0 });
    expect(find(await resolve([trigger()], { tuning: { trigger: { minForce: 0.1 } } }), "t").trigger?.tuning).toEqual({ maxZone: 0.25, minForce: 0.1 });
    expect(find(await resolve([trigger({ tuning: { maxZone: 0.4 } })], { tuning: { trigger: { maxZone: 0.3 } } }), "t").trigger?.tuning).toEqual({ maxZone: 0.4, minForce: 0 });
  });
});

describe("glow and toggles", () => {
  const button = (extra: object = {}) => control("b", { type: "button", bindings: ["cross"], elements: { bg: { role: "base" } }, ...extra });

  it("glow defaults to enabled with the active color", async () => {
    expect(find(await resolve([button()]), "b").glow).toEqual({ enabled: true, color: "active" });
  });

  it("glow follows the control, then the defaults", async () => {
    expect(find(await resolve([button()], { glow: { enabled: false } }), "b").glow).toEqual({ enabled: false, color: "active" });
    expect(find(await resolve([button({ glow: { color: "#FF00FF" } })], { glow: { enabled: false } }), "b").glow).toEqual({ enabled: false, color: "#FF00FF" });
  });

  it("toggleActive applies to fullscreen and gyro only", async () => {
    const gyro = control("g", { type: "system", action: "gyro", elements: { bg: { role: "base" } } });
    const skin = await resolve([gyro, button()], { toggleActive: false });
    expect(find(skin, "g").toggleActive).toBe(false);
    expect(find(skin, "b").toggleActive).toBeUndefined();
    expect(find(skin, "menu").toggleActive).toBeUndefined();
    const own = await resolve([control("g", { type: "system", action: "gyro", toggleActive: true, elements: { bg: { role: "base" } } })], { toggleActive: false });
    expect(find(own, "g").toggleActive).toBe(true);
  });
});
