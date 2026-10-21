import { describe, expect, it } from "vitest";
import { createRumble, RUMBLE_TAIL_MS } from "../../src/platform/rumble.ts";
import { applyLightbar } from "../../src/ui/lightbar.ts";

function stub(supported = true) {
  const calls: (number | number[])[] = [];
  return { calls, vibration: { supported: () => supported, vibrate: (p: number | number[]) => calls.push(p) } };
}

describe("rumble on the phone", () => {
  it("vibrates in pulses that follow the intensity and stops on zero", async () => {
    const { calls, vibration } = stub();
    const rumble = createRumble({ vibration });
    rumble.set(128, 0);
    const pattern = calls.at(-1) as number[];
    expect(pattern.slice(0, 4)).toEqual([65, 35, 65, 35]);
    rumble.set(255, 255);
    expect(calls.at(-1)).toBe(1200); // full rumble: one continuous vibration
    rumble.set(0, 0);
    await new Promise((r) => setTimeout(r, RUMBLE_TAIL_MS + 30));
    expect(calls.at(-1)).toBe(0);
  });

  it("keeps rumbling through quick bursts, like a motor spinning down", async () => {
    const { calls, vibration } = stub();
    const rumble = createRumble({ vibration });
    rumble.set(255, 0);
    rumble.set(0, 0); // a machine gun shot: on and off at once
    expect(calls).toEqual([1200]);
    await new Promise((r) => setTimeout(r, RUMBLE_TAIL_MS + 30));
    expect(calls).toEqual([1200, 0]);
    rumble.set(255, 0);
    rumble.set(0, 0);
    rumble.set(255, 0); // the next shot before the stop: keeps vibrating
    await new Promise((r) => setTimeout(r, RUMBLE_TAIL_MS + 30));
    expect(calls).toEqual([1200, 0, 1200]);
    rumble.stop();
  });

  it("does not restart the motor when the game repeats the same rumble", () => {
    const { calls, vibration } = stub();
    const rumble = createRumble({ vibration });
    rumble.set(128, 0);
    rumble.set(128, 0);
    rumble.set(129, 0); // same pulse length
    expect(calls).toHaveLength(1);
    rumble.set(255, 0);
    expect(calls).toHaveLength(2);
    rumble.set(0, 0);
    rumble.set(128, 0); // back before the stop happened: just changes the strength
    expect(calls).toHaveLength(3);
    rumble.stop();
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
    expect(el.style.getPropertyValue("--ninjoy-lightbar")).toBe("rgb(48 153 232)"); // back to the player's color
  });

  it("brightens dim LED colors, keeping the hue and fades", () => {
    const el = document.createElement("div");
    const shown = (rgb: [number, number, number]) => {
      applyLightbar(rgb, el);
      return el.style.getPropertyValue("--ninjoy-lightbar");
    };
    expect(shown([255, 0, 0])).toBe("rgb(255 0 0)");
    expect(shown([64, 0, 0])).toBe("rgb(179 0 0)"); // a quarter on the LED, clearly red on screen
    expect(shown([0, 32, 64])).toBe("rgb(0 89 179)");
    // a fade out stays a fade out
    const reds = [255, 128, 64, 16, 1].map((v) => Number(/rgb\((\d+)/.exec(shown([v, 0, 0]))![1]));
    expect(reds).toEqual([...reds].sort((a, b) => b - a));
    expect(new Set(reds).size).toBe(reds.length);
    applyLightbar([0, 0, 0], el);
    expect(el.style.getPropertyValue("--ninjoy-lightbar")).toBe("rgb(0 0 0)"); // off stays off
  });
});
