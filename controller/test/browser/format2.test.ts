import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { dpadDirections } from "../../src/engine/stick.ts";
import { applyLightbar, setPlayerColor } from "../../src/ui/lightbar.ts";
import "../../src/ui/styles.css";
import { at, inlineSkin, mount, pressed, stubPlatform, touch } from "./helpers.ts";

const rect = (id: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect id="${id}" width="100" height="100" fill="#123456"/></svg>`;
const STICK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="ring" cx="50" cy="50" r="50"/><circle id="ball" cx="50" cy="50" r="20"/></svg>';
const menu = { id: "menu", type: "system", action: "menu", svg: "r.svg", box: { x: 1500, y: 620, width: 100, height: 100 }, elements: { base: { role: "base" } } };

describe("format 2 on the controller", () => {
  let controller: Controller;
  let root: HTMLElement;
  afterEach(() => {
    controller.dispose();
    applyLightbar(null);
  });

  const start = async (controls: object[], extra: object = {}) => {
    const skin = await inlineSkin({ format: 2, name: "Format 2", controls: [menu, ...controls], ...extra }, { "r.svg": rect("base"), "s.svg": STICK });
    root = mount(1600, 720);
    controller = createController({ skin, root, storage: null, platform: stubPlatform() });
    controller.updateSettings({ size: 1, finger: 0 });
  };
  const fill = (control: string) => getComputedStyle(root.querySelector(`svg[data-control="${control}"] rect`)!).fill;

  it("paints lightbar elements with the player's color, then the game's", async () => {
    await start([{ id: "bar", type: "decor", svg: "r.svg", box: { x: 600, y: 0, width: 400, height: 40 }, elements: { base: { colors: { inactive: "lightbar" } } } }]);
    setPlayerColor(2);
    expect(fill("bar")).toBe("rgb(232, 72, 72)"); // player 2 is red, like a console
    applyLightbar([0, 0, 255]);
    expect(fill("bar")).toBe("rgb(0, 0, 255)");
    applyLightbar(null); // the game let go: back to the player's color
    expect(fill("bar")).toBe("rgb(232, 72, 72)");
  });

  it("lets touches pass through decorations", async () => {
    await start([
      { id: "x", type: "button", bindings: ["cross"], svg: "r.svg", box: { x: 600, y: 300, width: 200, height: 200 }, elements: { base: { role: "base" } } },
      { id: "glass", type: "decor", svg: "r.svg", box: { x: 500, y: 200, width: 400, height: 400 }, elements: { base: {} } },
    ]);
    const f = touch(root).down(...at(root, "x"));
    expect(pressed(controller)).toEqual(["cross"]);
    f.up();
    const outside = touch(root).down(...at(root, "glass", 0.05, 0.05)); // only the decoration there
    expect(pressed(controller)).toEqual([]);
    outside.up();
  });

  it("keeps fixed controls in place when the player resizes the layout", async () => {
    await start([
      { id: "ps", type: "button", bindings: ["ps"], fixed: true, svg: "r.svg", box: { x: 750, y: 600, width: 100, height: 100 }, elements: { base: { role: "base" } } },
      { id: "x", type: "button", bindings: ["cross"], svg: "r.svg", box: { x: 1200, y: 300, width: 100, height: 100 }, elements: { base: { role: "base" } } },
    ]);
    const box = (id: string) => root.querySelector(`svg[data-control="${id}"]`)!.getBoundingClientRect();
    const [ps, x] = [box("ps"), box("x")];
    controller.updateSettings({ size: 0.6, height: 0.5 });
    expect(box("ps")).toEqual(ps);
    expect(box("x").width).toBeLessThan(x.width);
  });

  it("keeps resizing controls above a fixed control under them", async () => {
    await start([
      { id: "ps", type: "button", bindings: ["ps"], fixed: true, svg: "r.svg", box: { x: 700, y: 500, width: 200, height: 100 }, elements: { base: { role: "base" } } },
      { id: "sh", type: "button", bindings: ["share"], svg: "r.svg", box: { x: 700, y: 380, width: 200, height: 100 }, elements: { base: { role: "base" } } },
    ]);
    const box = (id: string) => root.querySelector(`svg[data-control="${id}"]`)!.getBoundingClientRect();
    const [sh, gap] = [box("sh"), box("ps").top - box("sh").bottom];
    controller.updateSettings({ size: 0.5 });
    expect(box("sh").width).toBeCloseTo(sh.width / 2, 0);
    expect(box("sh").bottom).toBeLessThan(box("ps").top); // shrinks onto the PS, not under it
    expect(box("ps").top - box("sh").bottom).toBeCloseTo(gap / 2, 0); // the gap scales too
  });

  it("sends the d-pad from a d-pad stick and leaves the analog stick centered", async () => {
    await start([{ id: "lever", type: "stick", side: "left", output: "dpad", svg: "s.svg", box: { x: 100, y: 200, width: 400, height: 400 }, elements: { ring: { role: "base" }, ball: { role: "thumb" } } }]);
    const [cx, cy] = at(root, "lever");
    const f = touch(root).down(cx, cy);
    expect(pressed(controller)).toEqual([]); // dead zone
    f.move(cx + 150, cy);
    expect(pressed(controller)).toEqual(["right"]);
    f.move(cx + 120, cy + 120);
    expect(pressed(controller)).toEqual(["down", "right"]);
    f.move(cx, cy - 150);
    expect(pressed(controller)).toEqual(["up"]);
    expect(controller.state.sticks.left).toEqual({ x: 0, y: 0 });
    f.up();
    expect(pressed(controller)).toEqual([]);
  });
});

describe("d-pad directions from a stick", () => {
  it("picks the nearest of 8 directions", () => {
    expect([...dpadDirections(1, 0, null).dirs]).toEqual(["right"]);
    expect([...dpadDirections(0.7, 0.7, null).dirs]).toEqual(["down", "right"]);
    expect([...dpadDirections(-0.7, -0.7, null).dirs]).toEqual(["up", "left"]);
    expect([...dpadDirections(0, 0, null).dirs]).toEqual([]);
  });

  it("holds the direction on a border instead of flickering", () => {
    const right = dpadDirections(1, 0, null);
    // 25°: past the 22.5° border, but within the hysteresis of "right"
    const a = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)] as const;
    expect([...dpadDirections(...a(25), right.sector).dirs]).toEqual(["right"]);
    expect([...dpadDirections(...a(35), right.sector).dirs]).toEqual(["down", "right"]);
  });
});
