import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { inlineSkin, mount, pressed, touch } from "./helpers.ts";

const settle = () => new Promise((r) => setTimeout(r, 400));
const center = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

// Official left stick at 100% on 20:9: hitbox circle centered at (428.46, 545.02) with radius
// 174.98; the thumb is 34.5% of it, so the thumb's center travels 114.65 px.
const C = { x: 428.46, y: 545.02 };
const TRAVEL = 174.98 * (1 - 13.28 / 38.52);

describe("sticks (US2)", () => {
  let controller: Controller;
  let root: HTMLElement;
  let time = 0;

  const official = async () => {
    root = mount(1600, 720);
    controller = createController({ skin: await loadOfficialSkin(), root, storage: null, platform: { now: () => time } });
    controller.updateSettings({ size: 1 });
  };
  afterEach(() => controller.dispose());

  it("follows the finger with zones and saturates outside the stick", async () => {
    await official();
    const finger = touch(root).down(C.x + TRAVEL / 2, C.y);
    expect(controller.state.sticks.left.x).toBeCloseTo(0.4 / 0.85, 2); // dead 10%, 100% zone 5%
    expect(controller.state.sticks.left.y).toBeCloseTo(0, 5);
    finger.move(C.x, C.y - 1000); // far outside: the stick keeps the finger
    expect(controller.state.sticks.left.y).toBeCloseTo(-1, 5);
    finger.up();
    expect(controller.state.sticks.left).toEqual({ x: 0, y: 0 });
  });

  it("lets the stick finger press a button it passes", async () => {
    await official();
    const finger = touch(root).down(C.x, C.y);
    finger.move(700, 560); // Share, outside the stick
    expect(pressed(controller)).toEqual(["share"]);
    const { x, y } = controller.state.sticks.left;
    expect(Math.hypot(x, y)).toBeCloseTo(1, 5);
    finger.up();
  });

  it("moves the thumb's center to the finger and back to rest", async () => {
    await official();
    const thumb = root.querySelector('svg[data-control="stick-left"] [data-el="thumb"]')!;
    const rest = center(thumb);
    const finger = touch(root).down(C.x + 50, C.y + 30);
    expect(controller.state.sticks.left.x).not.toBe(0); // value is immediate, the drawing glides
    await settle();
    expect(center(thumb).x).toBeCloseTo(C.x + 50, 0);
    expect(center(thumb).y).toBeCloseTo(C.y + 30, 0);
    finger.move(C.x + 1000, C.y);
    await settle();
    expect(center(thumb).x).toBeCloseTo(C.x + TRAVEL, 0);
    finger.up();
    await settle();
    expect(center(thumb).x).toBeCloseTo(rest.x, 0);
    expect(center(thumb).y).toBeCloseTo(rest.y, 0);
  });

  it("holds L3 after a double-tap while the stick keeps moving", async () => {
    await official();
    time = 1000;
    const tap = touch(root).down(C.x, C.y);
    time = 1100;
    tap.up();
    time = 1300;
    const hold = touch(root).down(C.x, C.y);
    expect(pressed(controller)).toEqual(["l3"]);
    hold.move(C.x + TRAVEL, C.y);
    expect(pressed(controller)).toEqual(["l3"]);
    expect(controller.state.sticks.left.x).toBeCloseTo(1, 5);
    time = 3000;
    hold.up();
    expect(pressed(controller)).toEqual([]);
    time = 3400; // slow taps do not click
    const slow = touch(root).down(C.x, C.y);
    time = 3800;
    slow.up();
    time = 3900;
    const again = touch(root).down(C.x, C.y);
    expect(pressed(controller)).toEqual([]);
    again.up();
  });

  it("uses the touch-area box for an off-center, rectangular stick and honors click none", async () => {
    // hitbox 200 × 100; thumb 40 × 40 drawn left of center → travel 80 × 30
    const skin = await inlineSkin(
      {
        name: "Stick test",
        controls: [{
          id: "s", type: "stick", svg: "s.svg", side: "right", click: "none",
          box: { x: 100, y: 100, width: 200, height: 100 },
          tuning: { deadZone: 0, maxZone: 0 },
          elements: { hitbox: { role: "hitbox" }, base: { role: "base" }, thumb: { role: "thumb" } },
        }],
      },
      {
        "s.svg": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect id="hitbox" width="200" height="100" fill="none"/><ellipse id="base" cx="100" cy="50" rx="90" ry="40" fill="#123"/><circle id="thumb" cx="60" cy="50" r="20" fill="#456"/></svg>',
      },
    );
    root = mount(1600, 720);
    controller = createController({ skin, root, storage: null, platform: { now: () => time } });
    controller.updateSettings({ size: 1 });
    const thumb = root.querySelector('[data-el="thumb"]')!;
    expect(center(thumb).x).toBeCloseTo(160, 0);

    const finger = touch(root).down(240, 165);
    expect(controller.state.sticks.right.x).toBeCloseTo(0.5, 5);
    expect(controller.state.sticks.right.y).toBeCloseTo(0.5, 5);
    finger.move(200, 150);
    await settle();
    expect(center(thumb).x).toBeCloseTo(200, 0);
    finger.move(400, 150);
    await settle();
    expect(center(thumb).x).toBeCloseTo(280, 0);
    expect(controller.state.sticks.right.x).toBe(1);
    time = 10_000;
    finger.up();
    time = 10_050;
    const tap = touch(root).down(200, 150);
    time = 10_100;
    tap.up();
    time = 10_200;
    const hold = touch(root).down(200, 150);
    expect(pressed(controller)).toEqual([]);
    hold.up();
  });
});
