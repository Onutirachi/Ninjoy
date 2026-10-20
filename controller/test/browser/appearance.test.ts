import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { at, inlineSkin, mount, stubPlatform, touch } from "./helpers.ts";

const BLUE = "rgb(34, 125, 195)"; // #227DC3, the official active base
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const fillOf = (root: HTMLElement, control: string, el: string) => (root.querySelector(`[data-control="${control}"] [data-el="${el}"]`) as SVGElement).style.fill;
const shown = (root: HTMLElement, control: string, el: string) => (root.querySelector(`[data-control="${control}"] [data-el="${el}"]`) as SVGElement).style.display !== "none";

describe("visual feedback (US7)", () => {
  let controller: Controller;
  let root: HTMLElement;
  let platform: ReturnType<typeof stubPlatform>;

  const start = async (skin = loadOfficialSkin(), o: Parameters<typeof stubPlatform>[0] = {}) => {
    root = mount(1600, 720);
    platform = stubPlatform(o);
    controller = createController({ skin: await skin, root, storage: null, platform });
    controller.updateSettings({ size: 1, finger: 0 });
  };
  afterEach(() => controller.dispose());

  it("switches every element of a control to its active colors at once, with glow", async () => {
    await start();
    const cross = root.querySelector('svg[data-control="cross"]') as SVGSVGElement;
    expect(fillOf(root, "cross", "base")).toBe(""); // inactive: the color drawn in the SVG
    expect(cross.style.filter).toBe("");
    const finger = touch(root).down(...at(root, "cross"));
    expect(fillOf(root, "cross", "base")).toBe(BLUE);
    expect(fillOf(root, "cross", "label")).toBe("rgb(255, 255, 255)");
    expect(cross.style.filter).toContain("drop-shadow");
    expect(cross.style.filter).toContain(BLUE); // glow "active" = the active base color
    finger.up();
    expect(fillOf(root, "cross", "base")).toBe("");
    expect(cross.style.filter).toBe("");
  });

  it("colors the stick base and thumb while the stick is used", async () => {
    await start();
    const finger = touch(root).down(...at(root, "stick-left"));
    expect(fillOf(root, "stick-left", "base")).toBe(BLUE);
    expect(fillOf(root, "stick-left", "thumb")).toBe("rgb(48, 153, 232)");
    finger.up();
    expect(fillOf(root, "stick-left", "thumb")).toBe("");
  });

  it("looks active while gyro is on, unless the skin opts out", async () => {
    await start(loadOfficialSkin(), { motion: "available" });
    expect(root.querySelector('svg[data-control="gyro"]')!.hasAttribute("data-active")).toBe(true);
    controller.dispose();
    const skin = await loadOfficialSkin();
    await start(Promise.resolve({ ...skin, controls: skin.controls.map((c) => (c.id === "gyro" ? { ...c, toggleActive: false } : c)) }), { motion: "available" });
    expect(controller.state.gyro).toBe(true);
    expect(root.querySelector('svg[data-control="gyro"]')!.hasAttribute("data-active")).toBe(false);
  });

  it("swaps label-on / label-off, uses a single icon for both, and shows the pressed element", async () => {
    const skin = inlineSkin(
      {
        name: "Look test",
        controls: [
          { id: "both", type: "button", bindings: ["cross"], svg: "both.svg", box: { x: 100, y: 100, width: 100, height: 100 }, elements: { base: { role: "base" }, on: { role: "label-on" }, off: { role: "label-off" }, down: { role: "pressed" } } },
          { id: "one", type: "button", bindings: ["circle"], svg: "one.svg", box: { x: 300, y: 100, width: 100, height: 100 }, glow: { enabled: false }, elements: { base: { role: "base", colors: { active: "#00ff00" } }, on: { role: "label-on" } } },
        ],
      },
      {
        "both.svg": svg('<rect id="base" width="100" height="100" fill="#123"/><circle id="on" cx="50" cy="50" r="10"/><circle id="off" cx="50" cy="50" r="20"/><rect id="down" width="100" height="100" fill-opacity="0.3"/>'),
        "one.svg": svg('<rect id="base" width="100" height="100" fill="#123"/><circle id="on" cx="50" cy="50" r="10"/>'),
      },
    );
    await start(skin);
    expect([shown(root, "both", "on"), shown(root, "both", "off"), shown(root, "both", "down")]).toEqual([false, true, false]);
    const a = touch(root).down(150, 150);
    expect([shown(root, "both", "on"), shown(root, "both", "off"), shown(root, "both", "down")]).toEqual([true, false, true]);
    a.up();
    expect(shown(root, "one", "on")).toBe(true);
    const b = touch(root).down(350, 150);
    expect(shown(root, "one", "on")).toBe(true);
    expect(fillOf(root, "one", "base")).toBe("rgb(0, 255, 0)");
    expect((root.querySelector('svg[data-control="one"]') as SVGSVGElement).style.filter).toBe(""); // glow disabled
    b.up();
  });

  it("vibrates once each time a control becomes active", async () => {
    await start();
    const a = touch(root).down(...at(root, "cross"));
    expect(platform.calls.vibrate).toEqual([35]);
    a.move(...at(root, "circle"));
    expect(platform.calls.vibrate).toEqual([35, 35]);
    const b = touch(root).down(...at(root, "circle", 0.6));
    expect(platform.calls.vibrate).toHaveLength(2); // already active
    a.up();
    b.up();
  });

  it("does not vibrate on taps with game-only or no vibration, nor while the game rumbles", async () => {
    await start();
    controller.updateSettings({ tapStrength: 1 });
    controller.previewTap();
    expect(platform.calls.vibrate).toEqual([60]); // stronger = longer
    platform.calls.vibrate.length = 0;
    controller.updateSettings({ tapStrength: 0.5, vibration: "game" });
    touch(root).down(...at(root, "cross")).up();
    controller.updateSettings({ vibration: "off" });
    touch(root).down(...at(root, "cross")).up();
    controller.updateSettings({ vibration: "buttons" });
    touch(root).down(...at(root, "cross")).up();
    expect(platform.calls.vibrate).toEqual([35]); // buttons only still taps
    platform.calls.vibrate.length = 0;
    controller.updateSettings({ vibration: "all" });
    controller.setGameRumble(true); // a tap would replace the game's vibration
    touch(root).down(...at(root, "cross")).up();
    expect(platform.calls.vibrate).toEqual([]);
    controller.setGameRumble(false);
    touch(root).down(...at(root, "cross")).up();
    expect(platform.calls.vibrate).toEqual([35]);
  });
});
