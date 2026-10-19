import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { at, mount, touch } from "./helpers.ts";

/** In-memory Storage, shared across "reloads" of the page. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const rectOf = (root: HTMLElement, id: string) => {
  const r = root.querySelector(`svg[data-control="${id}"]`)!.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  return { left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top, width: r.width, height: r.height };
};

describe("layout and edit mode (US5)", () => {
  let controller: Controller;
  let root: HTMLElement;

  const start = async (w: number, h: number, storage: Storage | null = null, size?: number) => {
    root = mount(w, h);
    controller = createController({ skin: await loadOfficialSkin(), root, storage });
    if (size !== undefined) controller.updateSettings({ size });
  };
  afterEach(() => controller.dispose());

  it("keeps side groups at their edges and the bottom on 16:9", async () => {
    await start(1280, 720, null, 1);
    expect(rectOf(root, "l2-left").left).toBeCloseTo(0, 0);
    expect(rectOf(root, "l2-left").bottom).toBeCloseTo(720, 0);
    expect(rectOf(root, "r2-right").right).toBeCloseTo(1280, 0);
    expect(rectOf(root, "r2-right").bottom).toBeCloseTo(720, 0);
  });

  it("fits the whole skin in the width on 4:3", async () => {
    await start(1024, 768, null, 1);
    for (const c of (await loadOfficialSkin()).controls) {
      const r = rectOf(root, c.id);
      expect(r.left, c.id).toBeGreaterThanOrEqual(-1);
      expect(r.right, c.id).toBeLessThanOrEqual(1025);
    }
    expect(rectOf(root, "r2-right").right).toBeCloseTo(1024, 0);
  });

  it("keeps the side groups near the outer corners at automatic size on a tablet (SC-005)", async () => {
    await start(1024, 768);
    expect(controller.settings.size).toBe("auto");
    const left = rectOf(root, "l2-left"), right = rectOf(root, "r2-right");
    expect(left.left).toBeLessThanOrEqual(1024 * 0.15);
    expect(1024 - right.right).toBeLessThanOrEqual(1024 * 0.15);
    expect(left.bottom).toBeCloseTo(768, 0);
    expect(left.height).toBeLessThan(237.36 * 0.8); // smaller than on a phone
  });

  it("lifts the controller with the height setting", async () => {
    await start(1600, 720, null, 0.5);
    const low = rectOf(root, "cross").top;
    controller.updateSettings({ height: 1 });
    // free space above a half-size controller is 360 px
    expect(low - rectOf(root, "cross").top).toBeCloseTo(360, 0);
  });

  it("moves and resizes a group, keeps it across size changes and reloads, and resets", async () => {
    const storage = memoryStorage();
    await start(1600, 720, storage, 1);
    const before = rectOf(root, "cross");
    controller.setEditMode(true);
    const finger = touch(root).down(...at(root, "cross"));
    expect(controller.selection).toEqual({ group: "actions", scale: 1, tunable: [] });
    finger.move(at(root, "cross")[0] - 100, at(root, "cross")[1] + 50);
    finger.up();
    expect(controller.state.buttons.size).toBe(0); // no input while editing
    let after = rectOf(root, "cross");
    expect(after.left - before.left).toBeCloseTo(-100, 0);
    expect(after.top - before.top).toBeCloseTo(50, 0);

    const selected = controller.selection!;
    controller.setGroupScale(1.5);
    expect(controller.selection!.scale).toBe(1.5);
    after = rectOf(root, "cross");
    expect(after.width).toBeCloseTo(before.width * 1.5, 0);
    controller.setGroupScale(5);
    expect(controller.selection!.scale).toBe(2);
    controller.setGroupScale(1.5);
    controller.setEditMode(false);

    // half size: the offset and the group shrink with the controller
    controller.updateSettings({ size: 0.5 });
    const half = rectOf(root, "cross");
    expect(half.width).toBeCloseTo(before.width * 0.75, 0);

    controller.dispose();
    await start(1600, 720, storage);
    expect(controller.settings.size).toBe(0.5);
    expect(rectOf(root, "cross").width).toBeCloseTo(half.width, 1);
    expect(selected.group).toBeTruthy();

    controller.resetLayout();
    controller.updateSettings({ size: 1 });
    const reset = rectOf(root, "cross");
    expect(reset.left).toBeCloseTo(before.left, 0);
    expect(reset.width).toBeCloseTo(before.width, 0);
  });

  it("selects nothing on empty space", async () => {
    await start(1600, 720, null, 1);
    controller.setEditMode(true);
    touch(root).down(1240, 360).up();
    expect(controller.selection).toBeNull();
  });
});
