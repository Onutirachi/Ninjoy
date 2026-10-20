import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { filesFromMap, loadSkin, type LoadResult, type ResolvedSkin } from "../src/index.ts";
import { fixture, OFFICIAL_SKIN as SKIN_DIR, readSkinFolder } from "./helpers.ts";

describe("official Ninjoy skin", () => {
  let result: LoadResult;
  let skin: ResolvedSkin;

  beforeAll(async () => {
    const files = readSkinFolder(SKIN_DIR);
    result = await loadSkin(filesFromMap(files));
    if (result.ok) skin = result.skin;
  });

  it("loads with no errors, warnings or notes", () => {
    expect(result.report).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("covers every DS4 input plus the system controls", () => {
    const bindings = new Set(skin.controls.flatMap((c) => c.bindings ?? []));
    for (const b of ["cross", "circle", "square", "triangle", "up", "down", "left", "right", "l1", "r1", "share", "options", "ps"]) {
      expect(bindings, b).toContain(b);
    }
    const count = (pred: (c: ResolvedSkin["controls"][number]) => boolean) => skin.controls.filter(pred).length;
    expect(count((c) => (c.bindings ?? []).includes("l1"))).toBe(2); // one on each side
    expect(count((c) => (c.bindings ?? []).includes("r1"))).toBe(2);
    expect(count((c) => c.trigger?.which === "l2")).toBe(2);
    expect(count((c) => c.trigger?.which === "r2")).toBe(2);
    expect(skin.controls.filter((c) => c.type === "stick").map((c) => c.side).sort()).toEqual(["left", "right"]);
    // the touchpad click is a double tap on these areas (no separate click buttons)
    expect(skin.controls.filter((c) => c.type === "touchpad").map((c) => c.area).sort()).toEqual(["left", "right"]);
    expect(skin.controls.filter((c) => c.type === "system").map((c) => c.action).sort()).toEqual(["fullscreen", "gyro", "menu"]);
  });

  it("keeps every control where the artist drew it (within 1 canvas unit)", () => {
    const reference = JSON.parse(readFileSync(fixture("ninjoy-reference-boxes.json"), "utf8")) as Record<string, { x: number; y: number; width: number; height: number }>;
    expect(Object.keys(reference).sort()).toEqual(skin.controls.map((c) => c.id).sort());
    for (const control of skin.controls) {
      const ref = reference[control.id]!;
      for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(control.box[k] - ref[k]), `${control.id}.${k}`).toBeLessThanOrEqual(1);
    }
  });
});
