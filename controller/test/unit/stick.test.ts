import { describe, expect, it } from "vitest";
import { stickValue } from "../../src/engine/stick.ts";
import { applyZones } from "../../src/engine/zones.ts";

const none = { deadZone: 0, maxZone: 0 };

describe("applyZones", () => {
  it("maps the band between the zones linearly", () => {
    expect(applyZones(0.1, 0.1, 0.05)).toBe(0);
    expect(applyZones(0.95, 0.1, 0.05)).toBe(1);
    expect(applyZones(0.525, 0.1, 0.05)).toBeCloseTo(0.5);
    expect(applyZones(0.5, 0, 0)).toBe(0.5);
  });
});

describe("stickValue", () => {
  it("is the offset over the travel per axis", () => {
    const v = stickValue({ x: 50, y: -25 }, { x: 100, y: 100 }, none);
    expect(v.x).toBeCloseTo(0.5);
    expect(v.y).toBeCloseTo(-0.25);
  });

  it("clamps the finger onto the travel ellipse and saturates", () => {
    expect(stickValue({ x: 300, y: 0 }, { x: 100, y: 100 }, none)).toEqual({ x: 1, y: 0, clamped: { x: 100, y: 0 } });
    const d = stickValue({ x: 300, y: 300 }, { x: 100, y: 100 }, none);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(d.clamped.x).toBeCloseTo(100 / Math.SQRT2);
  });

  it("applies a radial dead zone and 100% zone", () => {
    const zones = { deadZone: 0.1, maxZone: 0.05 };
    expect(stickValue({ x: 7, y: 7 }, { x: 100, y: 100 }, zones)).toMatchObject({ x: 0, y: 0 });
    expect(stickValue({ x: 0, y: 96 }, { x: 100, y: 100 }, zones).y).toBe(1);
  });

  it("treats the axes of a rectangular stick independently", () => {
    const v = stickValue({ x: 100, y: 25 }, { x: 200, y: 50 }, none);
    expect(v.x).toBeCloseTo(0.5);
    expect(v.y).toBeCloseTo(0.5);
  });
});
