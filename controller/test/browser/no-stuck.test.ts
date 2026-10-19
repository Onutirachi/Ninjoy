import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { mount, stubPlatform, touch } from "./helpers.ts";

/** mulberry32: small seeded PRNG so failures can be replayed */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1600, H = 720;

describe("no stuck controls (SC-003)", () => {
  let controller: Controller;
  let root: HTMLElement;

  beforeAll(async () => {
    root = mount(W, H);
    controller = createController({ skin: await loadOfficialSkin(), root, storage: null, platform: stubPlatform({ fullscreen: false }) }); // toggles stay off: their "on" look is not a stuck control
    controller.updateSettings({ size: 1 });
  });
  afterAll(() => controller.dispose());

  it("always ends with an empty state after 200 random sequences", () => {
    const input = touch(root);
    for (let seed = 1; seed <= 200; seed++) {
      const rand = random(seed);
      const fingers: ReturnType<typeof input.down>[] = [];
      const steps = 10 + Math.floor(rand() * 40);
      for (let i = 0; i < steps; i++) {
        const r = rand();
        if ((r < 0.25 || !fingers.length) && fingers.length < 5) fingers.push(input.down(rand() * W, rand() * H));
        else if (r < 0.75) fingers[Math.floor(rand() * fingers.length)]!.move(rand() * W, rand() * H);
        else if (r < 0.9) fingers.splice(Math.floor(rand() * fingers.length), 1)[0]!.up();
        else if (r < 0.95) fingers.splice(Math.floor(rand() * fingers.length), 1)[0]!.cancel();
        else if (r < 0.975) { window.dispatchEvent(new Event("blur")); fingers.length = 0; }
        else {
          Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
          document.dispatchEvent(new Event("visibilitychange"));
          Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
          fingers.length = 0;
        }
      }
      for (const f of fingers) (rand() < 0.5 ? f.up : f.cancel)();
      const s = controller.state;
      const empty = s.buttons.size === 0 && s.triggers.l2 === 0 && s.triggers.r2 === 0 && s.touchpad.touches.length === 0 &&
        s.sticks.left.x === 0 && s.sticks.left.y === 0 && s.sticks.right.x === 0 && s.sticks.right.y === 0;
      expect(empty, `seed ${seed}: ${JSON.stringify({ ...s, buttons: [...s.buttons] })}`).toBe(true);
      expect(root.querySelectorAll("[data-active]"), `seed ${seed}: active look left on`).toHaveLength(0);
    }
  });
});
