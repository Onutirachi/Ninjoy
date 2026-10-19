import { beforeAll, describe, expect, it } from "vitest";
import { filesFromMap, loadSkin, type ResolvedControl, type ResolvedSkin } from "../src/index.ts";
import { fixture, readSkinFolder } from "./helpers.ts";

describe("hand-made minimal skin", () => {
  let skin: ResolvedSkin;
  const control = (id: string) => skin.controls.find((c) => c.id === id) as ResolvedControl;

  beforeAll(async () => {
    const result = await loadSkin(filesFromMap(readSkinFolder(fixture("minimal"))));
    expect(result.report.filter((e) => e.severity === "error")).toEqual([]);
    if (!result.ok) throw new Error("minimal skin did not load");
    skin = result.skin;
  });

  it("resolves a button with several bindings as one control", () => {
    expect(control("diagonal").bindings).toEqual(["up", "left"]);
  });

  it("resolves the stick side, its default click and its element roles", () => {
    const stick = control("stick");
    expect(stick.side).toBe("left");
    expect(stick.stick?.click).toBe("l3");
    const roles = Object.fromEntries(stick.elements.map((e) => [e.id, e.role]));
    expect(roles).toEqual({ ring: "base", ball: "thumb", "ball-text": "thumb-label", area: "hitbox" });
  });

  it("resolves the trigger direction", () => {
    expect(control("r2").trigger).toMatchObject({ which: "r2", direction: "right" });
  });

  it("accepts an SVG group as one element", () => {
    expect(control("diagonal").elements).toContainEqual({ id: "icon", role: "label", colors: { inactive: null, active: null } });
  });

  it("keeps the declared box exactly", () => {
    expect(control("r2").box).toEqual({ x: 1100, y: 560, width: 300, height: 100 });
  });
});
