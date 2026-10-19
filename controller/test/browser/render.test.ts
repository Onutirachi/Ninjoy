import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { mount } from "./helpers.ts";

describe("rendering the official skin", () => {
  let controller: Controller | undefined;
  afterEach(() => controller?.dispose());

  it("draws every control in its canvas box at 100% on a 20:9 screen", async () => {
    const skin = await loadOfficialSkin();
    const root = mount(1600, 720);
    controller = createController({ skin, root, storage: null });
    controller.updateSettings({ size: 1 });
    const rect = root.getBoundingClientRect();
    expect(root.querySelectorAll("svg[data-control]")).toHaveLength(28);
    for (const control of skin.controls) {
      const el = root.querySelector(`svg[data-control="${control.id}"]`) as SVGSVGElement;
      const r = el.getBoundingClientRect();
      expect(Math.abs(r.left - rect.left - control.box.x), `${control.id} x`).toBeLessThanOrEqual(1);
      expect(Math.abs(r.top - rect.top - control.box.y), `${control.id} y`).toBeLessThanOrEqual(1);
      expect(Math.abs(r.width - control.box.width), `${control.id} width`).toBeLessThanOrEqual(1);
      expect(Math.abs(r.height - control.box.height), `${control.id} height`).toBeLessThanOrEqual(1);
    }
  });

  it("draws the background layer with the skin color", async () => {
    const skin = await loadOfficialSkin();
    const root = mount(1600, 720);
    controller = createController({ skin, root, storage: null });
    const bg = root.querySelector("[data-background]") as HTMLElement;
    expect(getComputedStyle(bg).backgroundColor).toBe("rgb(0, 0, 0)");
  });
});
