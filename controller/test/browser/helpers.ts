import { filesFromMap, loadSkin, type ResolvedSkin } from "@ninjoy/skin-format";
import type { Controller } from "../../src/dom/controller.ts";

/** A fresh, absolutely positioned root of the given CSS size at the top-left of the page. */
export function mount(width: number, height: number): HTMLElement {
  document.body.replaceChildren();
  document.body.style.margin = "0";
  const root = document.createElement("div");
  Object.assign(root.style, { position: "absolute", left: "0", top: "0", width: `${width}px`, height: `${height}px` });
  document.body.append(root);
  return root;
}

let nextId = 1;

/** Synthetic touch input on the controller's stage. */
export function touch(root: HTMLElement) {
  const stage = root.querySelector("[data-stage]") as HTMLElement;
  const fire = (type: string, id: number, x: number, y: number) =>
    stage.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: "touch", isPrimary: id === 1 }));
  return {
    down(x: number, y: number) {
      const id = nextId++;
      fire("pointerdown", id, x, y);
      return {
        id,
        move: (nx: number, ny: number) => fire("pointermove", id, nx, ny),
        up: (nx = x, ny = y) => fire("pointerup", id, nx, ny),
        cancel: () => fire("pointercancel", id, x, y),
      };
    },
  };
}

/** Screen position of a canvas point (canvas units) of a control's box fraction. */
export function at(root: HTMLElement, controlId: string, fx = 0.5, fy = 0.5): [number, number] {
  const el = root.querySelector(`svg[data-control="${controlId}"]`) as SVGSVGElement;
  const r = el.getBoundingClientRect();
  return [r.left + r.width * fx, r.top + r.height * fy];
}

export const pressed = (controller: Controller) => [...controller.state.buttons].sort();

/** Loads an inline test skin (manifest object + SVG strings). */
export async function inlineSkin(manifest: object, files: Record<string, string>): Promise<ResolvedSkin> {
  const result = await loadSkin(filesFromMap({ "skin.json": JSON.stringify({ format: 1, author: "Tests", version: "1.0.0", orientation: "landscape", ...manifest }), ...files }));
  if (!result.ok) throw new Error(JSON.stringify(result.report));
  return result.skin;
}
