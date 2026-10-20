import { describe, expect, it } from "vitest";
import { clampSettings, DEFAULT_SETTINGS, stickZones, triggerZones } from "../../src/engine/settings.ts";

const stick = { stick: { click: "l3" as const, tuning: { deadZone: 0.2, maxZone: 0.1 } } };
const trigger = { trigger: { tuning: { maxZone: 0.3, minForce: 0.05 } } };

describe("player settings", () => {
  it("has the documented defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({ size: "auto", height: 0, finger: 14, gyro: true, vibration: "buttons", tapStrength: 0.5, language: "auto" });
  });

  it("clamps every value to its range", () => {
    expect(clampSettings({ ...DEFAULT_SETTINGS, size: 0.1, height: 2, finger: 99, stickDeadZone: 0.9, stickMaxZone: 0.9, triggerMinForce: 0.9, triggerMaxZone: 0.9 }))
      .toMatchObject({ size: 0.4, height: 1, finger: 40, stickDeadZone: 0.4, stickMaxZone: 0.3, triggerMinForce: 0.5, triggerMaxZone: 0.5 });
    expect(clampSettings({ ...DEFAULT_SETTINGS, size: 5, height: -1, finger: -3 })).toMatchObject({ size: 1, height: 0, finger: 0 });
  });

  it("uses the skin's zones until the player changes them", () => {
    expect(stickZones(stick, DEFAULT_SETTINGS)).toEqual({ deadZone: 0.2, maxZone: 0.1 });
    expect(triggerZones(trigger, DEFAULT_SETTINGS)).toEqual({ maxZone: 0.3, minForce: 0.05 });
    expect(stickZones(stick, { ...DEFAULT_SETTINGS, stickDeadZone: 0.15 })).toEqual({ deadZone: 0.15, maxZone: 0.1 });
    expect(triggerZones(trigger, { ...DEFAULT_SETTINGS, triggerMaxZone: 0.4 })).toEqual({ maxZone: 0.4, minForce: 0.05 });
  });

  it("uses a control override only when it does not inherit", () => {
    const settings = { ...DEFAULT_SETTINGS, triggerMaxZone: 0.4 };
    expect(triggerZones(trigger, settings, { inherit: true, triggerMaxZone: 0.1 })).toEqual({ maxZone: 0.4, minForce: 0.05 });
    expect(triggerZones(trigger, settings, { inherit: false, triggerMaxZone: 0.1 })).toEqual({ maxZone: 0.1, minForce: 0.05 });
  });
});
