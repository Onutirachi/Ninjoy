import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { at, mount, pressed, touch } from "./helpers.ts";

// Official skin at 100% on a 20:9 root: canvas units are CSS pixels. Face buttons are circles
// filling their 140.64 boxes; triangle and circle are 7.4 px apart at their closest points.
describe("buttons (US1)", () => {
  let controller: Controller;
  let root: HTMLElement;

  beforeEach(async () => {
    root = mount(1600, 720);
    controller = createController({ skin: await loadOfficialSkin(), root, storage: null });
    controller.updateSettings({ size: 1 });
  });
  afterEach(() => controller.dispose());

  it("presses ✕ while touched and releases it on lift", () => {
    const finger = touch(root).down(...at(root, "cross"));
    expect(pressed(controller)).toEqual(["cross"]);
    finger.up();
    expect(pressed(controller)).toEqual([]);
  });

  it("moves from ✕ to ○ when the finger slides", () => {
    const finger = touch(root).down(...at(root, "cross"));
    finger.move(...at(root, "circle"));
    expect(pressed(controller)).toEqual(["circle"]);
    finger.up();
    expect(pressed(controller)).toEqual([]);
  });

  it("presses △ and ○ together when the finger circle overlaps both", () => {
    const finger = touch(root).down(1477.26, 122.65);
    expect(pressed(controller)).toEqual(["circle", "triangle"]);
    finger.up();
  });

  it("uses the exact drawn edge with no extra margin", () => {
    controller.updateSettings({ finger: 0 });
    const [x, y] = at(root, "cross");
    const outside = touch(root).down(x, y + 70.32 + 1);
    expect(pressed(controller)).toEqual([]);
    outside.up();
    const inside = touch(root).down(x, y + 70.32 - 1);
    expect(pressed(controller)).toEqual(["cross"]);
    inside.up();
    controller.updateSettings({ finger: 5 });
    const grown = touch(root).down(x, y + 70.32 + 4);
    expect(pressed(controller)).toEqual(["cross"]);
    grown.up();
  });

  it("keeps a button pressed until every finger on it lifts", () => {
    const a = touch(root).down(...at(root, "cross", 0.4));
    const b = touch(root).down(...at(root, "cross", 0.6));
    a.up();
    expect(pressed(controller)).toEqual(["cross"]);
    b.up();
    expect(pressed(controller)).toEqual([]);
  });

  it("presses a button when a finger slides onto it from empty space", () => {
    const finger = touch(root).down(1240, 360); // gap between the face buttons, R stick and L1
    expect(pressed(controller)).toEqual([]);
    finger.move(...at(root, "square"));
    expect(pressed(controller)).toEqual(["square"]);
    finger.cancel();
    expect(pressed(controller)).toEqual([]);
  });

  it("publishes a new state only when something changes", () => {
    const seen: number[] = [];
    controller.subscribe((s) => seen.push(s.seq));
    const finger = touch(root).down(...at(root, "cross", 0.5, 0.5));
    finger.move(...at(root, "cross", 0.52, 0.5));
    finger.up();
    expect(seen).toHaveLength(2);
  });
});
