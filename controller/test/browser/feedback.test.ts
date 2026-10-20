import { describe, expect, it } from "vitest";
import { createRumble } from "../../src/platform/rumble.ts";
import { applyLightbar } from "../../src/ui/lightbar.ts";

function stub(supported = true) {
  const calls: (number | number[])[] = [];
  return { calls, vibration: { supported: () => supported, vibrate: (p: number | number[]) => calls.push(p) } };
}

describe("rumble on the phone", () => {
  it("vibrates in pulses that follow the intensity and stops on zero", () => {
    const { calls, vibration } = stub();
    const rumble = createRumble({ vibration });
    rumble.set(128, 0);
    const pattern = calls.at(-1) as number[];
    expect(pattern.slice(0, 4)).toEqual([50, 50, 50, 50]);
    rumble.set(255, 255);
    expect(calls.at(-1)).toBe(1200); // full rumble: one continuous vibration
    rumble.set(0, 0);
    expect(calls.at(-1)).toBe(0);
  });

  it("stops when the page is hidden or disconnected", () => {
    const { calls, vibration } = stub();
    const rumble = createRumble({ vibration });
    rumble.set(200, 0);
    rumble.stop();
    expect(calls.at(-1)).toBe(0);
  });

  it("keeps vibrating while the rumble lasts", async () => {
    const { calls, vibration } = stub();
    const rumble = createRumble({ vibration });
    rumble.set(100, 0);
    const before = calls.length;
    await new Promise((r) => setTimeout(r, 1150));
    expect(calls.length).toBeGreaterThan(before);
    rumble.stop();
  });

  it("does not touch the vibration API before vibrating", () => {
    const { calls, vibration } = stub();
    const rumble = createRumble({ vibration });
    rumble.stop();
    rumble.set(0, 0);
    expect(calls).toEqual([]);
  });

  it("explains once when the device cannot vibrate", () => {
    const { calls, vibration } = stub(false);
    let told = 0;
    const rumble = createRumble({ vibration, onUnsupported: () => told++ });
    rumble.set(255, 0);
    rumble.set(100, 0);
    expect(told).toBe(1);
    expect(calls).toEqual([]);
  });
});

describe("lightbar", () => {
  it("exposes the color as a CSS property", () => {
    const el = document.createElement("div");
    applyLightbar([255, 0, 128], el);
    expect(el.style.getPropertyValue("--ninjoy-lightbar")).toBe("rgb(255 0 128)");
    applyLightbar(null, el);
    expect(el.style.getPropertyValue("--ninjoy-lightbar")).toBe("");
  });
});
