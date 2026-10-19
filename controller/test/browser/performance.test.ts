import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { mount, stubPlatform, touch } from "./helpers.ts";

// SC-002: a pointer event is handled (hit testing, state, looks) in under 2 ms on a mid-range
// phone; CPU throttling ×4 stands in for one.
describe("performance (SC-002)", () => {
  let controller: Controller;
  let root: HTMLElement;
  const session = cdp();

  beforeAll(async () => {
    root = mount(1600, 720);
    controller = createController({ skin: await loadOfficialSkin(), root, storage: null, platform: stubPlatform() });
    controller.updateSettings({ size: 1 });
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  });
  afterAll(async () => {
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    controller.dispose();
  });

  it("handles 1,000 moves over the official skin in under 2 ms each, publishing within the handler", () => {
    const seqs: number[] = [];
    controller.subscribe((s) => seqs.push(s.seq));
    const input = touch(root);
    const a = input.down(428, 545); // left stick
    const b = input.down(1400, 600); // right triggers
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const t = i / 1000;
      (i % 2 ? a : b).move(i % 2 ? 300 + 250 * t : 1300 + 300 * t, i % 2 ? 400 + 300 * t : 300 + 400 * t);
    }
    const perEvent = (performance.now() - start) / 1000;
    a.up();
    b.up();
    console.log(`average ${perEvent.toFixed(3)} ms per pointer event (CPU ×4)`);
    expect(seqs.length).toBeGreaterThan(500); // states were published synchronously
    expect(perEvent).toBeLessThan(2);
  });
});
