import type { RenderedControl } from "./renderer.ts";

export interface ScreenBox { left: number; top: number; right: number; bottom: number; width: number; height: number }

interface Shape {
  el: SVGGeometryElement;
  inverse: DOMMatrix;
  /** screen box grown by the visible stroke */
  box: ScreenBox;
  stroke: boolean;
}

interface Area {
  shapes: Shape[];
  /** box of the touch area (hitbox, else union of bases), without strokes */
  box: ScreenBox;
}

const SAMPLES = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);

/** Elements whose shape is the control's touch area: the hitbox, else every base, else everything. */
export function touchAreaElements(rc: RenderedControl): SVGElement[] {
  const byRole = (role: string) => rc.control.elements.filter((e) => e.role === role).map((e) => rc.elements.get(e.id)).filter((e): e is SVGElement => !!e);
  const hitbox = byRole("hitbox");
  if (hitbox.length) return hitbox;
  const bases = byRole("base");
  return bases.length ? bases : [rc.svg];
}

const isGeometry = (el: Element): el is SVGGeometryElement => el instanceof SVGGeometryElement;

/**
 * Exact hit testing against the drawn shapes. The finger is a circle: its center and 8 points
 * on its radius are tested. Matrices and boxes are measured once per layout revision.
 */
export class HitTester {
  private areas = new Map<RenderedControl, Area>();

  /** Call after anything that moves controls on screen. */
  invalidate(): void {
    this.areas.clear();
  }

  box(rc: RenderedControl): ScreenBox {
    return this.area(rc).box;
  }

  hits(rc: RenderedControl, x: number, y: number, radius: number): boolean {
    for (const shape of this.area(rc).shapes) {
      const { box } = shape;
      if (x < box.left - radius || x > box.right + radius || y < box.top - radius || y > box.bottom + radius) continue;
      if (test(shape, x, y)) return true;
      if (radius > 0) for (const [cx, cy] of SAMPLES) if (test(shape, x + cx * radius, y + cy * radius)) return true;
    }
    return false;
  }

  private area(rc: RenderedControl): Area {
    let area = this.areas.get(rc);
    if (!area) {
      area = measure(rc);
      this.areas.set(rc, area);
    }
    return area;
  }
}

function test(shape: Shape, x: number, y: number): boolean {
  const p = shape.inverse.transformPoint({ x, y });
  return shape.el.isPointInFill(p) || (shape.stroke && shape.el.isPointInStroke(p));
}

function measure(rc: RenderedControl): Area {
  const shapes: Shape[] = [];
  const outer: ScreenBox[] = [];
  for (const el of touchAreaElements(rc)) {
    for (const shapeEl of [el, ...el.querySelectorAll("*")]) {
      if (!isGeometry(shapeEl)) continue;
      const ctm = shapeEl.getScreenCTM();
      if (!ctm) continue;
      const matrix = DOMMatrix.fromMatrix(ctm);
      const r = shapeEl.getBoundingClientRect();
      const style = getComputedStyle(shapeEl);
      const strokeWidth = parseFloat(style.strokeWidth) || 0;
      const stroke = style.stroke !== "none" && strokeWidth > 0 && parseFloat(style.strokeOpacity || "1") > 0 && style.visibility !== "hidden";
      const grow = stroke ? (strokeWidth / 2) * Math.hypot(matrix.a, matrix.b) : 0;
      outer.push(r);
      shapes.push({ el: shapeEl, inverse: matrix.inverse(), stroke, box: boxOf(r.left - grow, r.top - grow, r.right + grow, r.bottom + grow) });
    }
  }
  if (!outer.length) outer.push(rc.svg.getBoundingClientRect());
  return {
    shapes,
    box: boxOf(Math.min(...outer.map((r) => r.left)), Math.min(...outer.map((r) => r.top)), Math.max(...outer.map((r) => r.right)), Math.max(...outer.map((r) => r.bottom))),
  };
}

const boxOf = (left: number, top: number, right: number, bottom: number): ScreenBox => ({ left, top, right, bottom, width: right - left, height: bottom - top });
