import { describe, expect, it } from "vitest";
import { CYCLE_MS, rumblePulse } from "../../src/platform/rumble.ts";

describe("rumblePulse", () => {
  it("turns intensity into pulse length within each 100 ms cycle", () => {
    expect(rumblePulse(255, 0)).toEqual([100, 0]);
    expect(rumblePulse(0, 128)).toEqual([50, 50]);
    expect(rumblePulse(64, 191)).toEqual([75, 25]); // the stronger motor decides
    expect(rumblePulse(1, 0)).toEqual([10, 90]); // very weak rumble is still felt
  });

  it("stops at zero", () => {
    expect(rumblePulse(0, 0)).toBeNull();
  });

  it("always fills one cycle", () => {
    for (let v = 1; v <= 255; v += 7) {
      const [on, off] = rumblePulse(v, 0)!;
      expect(on + off).toBe(CYCLE_MS);
    }
  });
});
