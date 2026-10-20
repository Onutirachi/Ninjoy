import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller, type NoticeKey } from "../../src/dom/controller.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { at, inlineSkin, mount, pressed, stubPlatform, touch } from "./helpers.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));
const sample = { rate: { x: 1, y: 2, z: 3 }, accel: { x: 4, y: 5, z: 6 }, time: 42 };

describe("touchpad, system controls and motion (US4)", () => {
  let controller: Controller;
  let root: HTMLElement;
  let platform: ReturnType<typeof stubPlatform>;
  let menus = 0;
  let notices: NoticeKey[] = [];

  const start = async (o: Parameters<typeof stubPlatform>[0] = {}) => {
    root = mount(1600, 720);
    platform = stubPlatform(o);
    menus = 0;
    notices = [];
    controller = createController({
      skin: await loadOfficialSkin(), root, storage: null, platform,
      onMenu: () => menus++,
      onNotice: (key) => notices.push(key),
    });
    controller.updateSettings({ size: 1, finger: 0 });
  };
  const touches = () => controller.state.touchpad.touches.map(({ x, y }) => [Number(x.toFixed(2)), Number(y.toFixed(2))]);
  afterEach(() => controller.dispose());

  it("maps the touchpad halves onto the single DS4 touchpad", async () => {
    await start();
    const left = touch(root).down(...at(root, "touchpad-left"));
    expect(touches()).toEqual([[0.25, 0.5]]);
    left.up();
    const right = touch(root).down(...at(root, "touchpad-right"));
    expect(touches()).toEqual([[0.75, 0.5]]);
    right.up();
    expect(touches()).toEqual([]);
  });

  it("reports only the two most recent touches", async () => {
    await start();
    const a = touch(root).down(...at(root, "touchpad-left", 0.2, 0.5));
    const b = touch(root).down(...at(root, "touchpad-left", 0.8, 0.5));
    const c = touch(root).down(...at(root, "touchpad-right", 0.5, 0.5));
    expect(controller.state.touchpad.touches.map((t) => t.id)).toEqual([b.id, c.id]);
    c.up();
    expect(controller.state.touchpad.touches.map((t) => t.id)).toEqual([a.id, b.id]);
    a.up();
    b.up();
  });

  it("clicks the touchpad and touches the half from click buttons (skins may still have them)", async () => {
    const rect = (id: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="${id}" width="100" height="100" fill="#123"/></svg>`;
    const area = (id: string, side: "left" | "right", x: number) => ({ id, type: "touchpad", area: side, svg: `${id}.svg`, box: { x, y: 0, width: 200, height: 200 }, elements: { base: { role: "base" } } });
    const click = (id: string, side: "left" | "right", x: number) => ({ id, type: "button", bindings: [`touchpad-${side}`], svg: `${id}.svg`, box: { x, y: 300, width: 100, height: 100 }, elements: { base: { role: "base" } } });
    const skin = await inlineSkin(
      { name: "Click buttons", controls: [area("tl", "left", 0), area("tr", "right", 300), click("cl", "left", 0), click("cr", "right", 300)] },
      { "tl.svg": rect("base"), "tr.svg": rect("base"), "cl.svg": rect("base"), "cr.svg": rect("base") },
    );
    root = mount(1600, 720);
    platform = stubPlatform();
    controller = createController({ skin, root, storage: null, platform });
    controller.updateSettings({ size: 1, finger: 0 });
    const left = touch(root).down(...at(root, "cl"));
    expect(pressed(controller)).toEqual(["touchpad"]);
    expect(touches()).toEqual([[0.25, 0.5]]);
    const finger = touch(root).down(...at(root, "tr", 0.2, 0.2));
    expect(touches()).toEqual([[0.6, 0.2]]); // a finger on the touchpad: only it is reported
    finger.up();
    left.up();
    const right = touch(root).down(...at(root, "cr"));
    expect(touches()).toEqual([[0.75, 0.5]]);
    right.up();
    expect(pressed(controller)).toEqual([]);
  });

  it("opens the menu when the finger lifts, releasing everything", async () => {
    await start();
    const held = touch(root).down(...at(root, "cross"));
    const menu = touch(root).down(...at(root, "menu"));
    expect(menus).toBe(0);
    menu.up();
    expect(menus).toBe(1);
    expect(pressed(controller)).toEqual([]);
    held.up();
    touch(root).down(...at(root, "menu")).cancel();
    expect(menus).toBe(1);
  });

  it("toggles fullscreen on release, or explains how on unsupported browsers", async () => {
    await start();
    const svg = root.querySelector('svg[data-control="fullscreen"]')!;
    touch(root).down(...at(root, "fullscreen")).up();
    expect(platform.calls.fullscreen).toBe(1);
    expect(svg.hasAttribute("data-active")).toBe(true); // a toggle that is on looks active
    touch(root).down(...at(root, "fullscreen")).up();
    expect(svg.hasAttribute("data-active")).toBe(false);
    controller.dispose();
    await start({ fullscreen: false });
    touch(root).down(...at(root, "fullscreen")).up();
    expect(platform.calls.fullscreen).toBe(0);
    expect(notices).toEqual(["noFullscreen"]);
  });

  it("reports motion in the controller frame only while gyro is on", async () => {
    await start({ motion: "available", angle: 90 });
    expect(controller.state.gyro).toBe(true);
    platform.emitMotion(sample);
    expect(controller.state.motion).toEqual({ rate: { x: -2, y: 1, z: 3 }, accel: { x: -5, y: 4, z: 6 }, time: 42 });
    touch(root).down(...at(root, "gyro")).up();
    expect(controller.state).toMatchObject({ gyro: false, motion: null });
    platform.emitMotion(sample);
    expect(controller.state.motion).toBeNull();
    touch(root).down(...at(root, "gyro")).up();
    await tick();
    expect(platform.calls.permission).toBe(1);
    expect(controller.state.gyro).toBe(true);
    expect(controller.settings.gyro).toBe(true);
  });

  it("keeps gyro off with a notice when permission is denied or motion is unavailable", async () => {
    await start({ motion: "available", permission: false });
    controller.updateSettings({ gyro: false });
    touch(root).down(...at(root, "gyro")).up();
    await tick();
    expect(controller.state.gyro).toBe(false);
    expect(notices).toEqual(["motionDenied"]);
    controller.dispose();
    await start({ motion: "insecure" });
    expect(controller.state.gyro).toBe(false);
    touch(root).down(...at(root, "gyro")).up();
    expect(notices).toEqual(["motionInsecure"]);
  });
});

describe("touchpad click by double tap (polish US2)", () => {
  let controller: Controller;
  let root: HTMLElement;
  let time = 0;
  afterEach(() => controller.dispose());

  const start = async () => {
    root = mount(1600, 720);
    controller = createController({ skin: await loadOfficialSkin(), root, storage: null, platform: { ...stubPlatform(), now: () => time } });
    controller.updateSettings({ size: 1, finger: 0 });
  };

  for (const side of ["left", "right"] as const) {
    it(`double tap and hold on the ${side} touchpad clicks at the finger`, async () => {
      await start();
      time = 1000;
      const tap = touch(root).down(...at(root, `touchpad-${side}`, 0.3, 0.5));
      time = 1100;
      tap.up();
      time = 1300;
      const hold = touch(root).down(...at(root, `touchpad-${side}`, 0.3, 0.5));
      expect(pressed(controller)).toEqual(["touchpad"]);
      const [t] = controller.state.touchpad.touches;
      expect(t!.x).toBeCloseTo(side === "left" ? 0.15 : 0.65, 1); // reported on that half
      // dragging with the click held, like a laptop touchpad
      time = 1500;
      hold.move(...at(root, `touchpad-${side}`, 0.9, 0.2));
      expect(pressed(controller)).toEqual(["touchpad"]);
      expect(controller.state.touchpad.touches[0]!.x).toBeCloseTo(side === "left" ? 0.45 : 0.95, 1);
      // sliding out over the buttons below keeps only the click
      hold.move(...at(root, "share"));
      expect(pressed(controller)).toEqual(["touchpad"]);
      time = 2000;
      hold.up();
      expect(pressed(controller)).toEqual([]);
    });
  }

  it("a plain touch or drag does not click", async () => {
    await start();
    time = 1000;
    const drag = touch(root).down(...at(root, "touchpad-left", 0.2, 0.5));
    drag.move(...at(root, "touchpad-left", 0.8, 0.5));
    expect(pressed(controller)).toEqual([]);
    time = 1600;
    drag.up();
    time = 1700;
    const again = touch(root).down(...at(root, "touchpad-left", 0.5, 0.5));
    expect(pressed(controller)).toEqual([]);
    again.up();
  });

  it("quick flicks across the touchpad do not click", async () => {
    await start();
    for (let i = 0; i < 3; i++) {
      time = 1000 + i * 150;
      const flick = touch(root).down(...at(root, "touchpad-left", 0.3, 0.5));
      time += 40;
      flick.move(...at(root, "touchpad-left", 0.5, 0.5));
      expect(pressed(controller)).toEqual([]);
      time += 40;
      flick.up();
    }
  });
});
