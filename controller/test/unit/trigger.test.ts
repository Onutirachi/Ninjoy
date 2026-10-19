import { describe, expect, it } from "vitest";
import { triggerForce } from "../../src/engine/zones.ts";

describe("triggerForce", () => {
  it("follows m + (1 − m)·min(1, r / (1 − z))", () => {
    expect(triggerForce(0.4, 0.25, 0)).toBeCloseTo(0.5333, 3);
    expect(triggerForce(0.8, 0.25, 0)).toBe(1);
    expect(triggerForce(0, 0.25, 0.1)).toBeCloseTo(0.1);
    expect(triggerForce(0.5, 0, 0)).toBe(0.5);
  });

  it("has no dead zone: any touch above the bottom gives force", () => {
    expect(triggerForce(0.01, 0.25, 0)).toBeGreaterThan(0);
  });
});
