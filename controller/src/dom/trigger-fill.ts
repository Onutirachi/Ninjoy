import type { Direction } from "@ninjoy/skin-format";
import { SVG_NS, type RenderedControl } from "./renderer.ts";

interface LocalBox { x: number; y: number; w: number; h: number }

const svgEl = (tag: string, attrs: Record<string, string | number> = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** Rectangle covering the fractions [a, b] of the trigger, measured from its weak end. */
function band(box: LocalBox, direction: Direction, a: number, b: number) {
  const len = Math.max(0, b - a);
  switch (direction) {
    case "up": return { x: box.x, y: box.y + box.h * (1 - b), width: box.w, height: box.h * len };
    case "down": return { x: box.x, y: box.y + box.h * a, width: box.w, height: box.h * len };
    case "right": return { x: box.x + box.w * a, y: box.y, width: box.w * len, height: box.h };
    case "left": return { x: box.x + box.w * (1 - b), y: box.y, width: box.w * len, height: box.h };
  }
}

const setRect = (el: Element, r: Record<string, number>) => {
  for (const [k, v] of Object.entries(r)) el.setAttribute(k, String(v));
};

/**
 * The trigger's fill and 100% zone, cut to the union of its base shapes and drawn above the
 * last base (below labels). Nothing shows until the trigger is touched; both layers get more
 * opaque as the force grows. A custom `level` element is revealed instead of the plain fill.
 */
export function createTriggerFill(rc: RenderedControl) {
  const { control } = rc;
  const trigger = control.trigger!;
  const bases = control.elements.filter((e) => e.role === "base").map((e) => rc.elements.get(e.id)).filter((e): e is SVGElement => !!e);
  const level = control.elements.filter((e) => e.role === "level").map((e) => rc.elements.get(e.id)).find((e) => !!e);
  const id = `nj-${control.id}--fx`;

  const silhouette = svgEl("g");
  for (const b of bases) silhouette.append(b.cloneNode(true));
  for (const e of [silhouette, ...silhouette.querySelectorAll("*")]) {
    e.removeAttribute("id");
    e.removeAttribute("data-el");
    e.removeAttribute("class");
    e.setAttribute("style", "fill:#fff;stroke:none;fill-opacity:1;opacity:1;filter:none");
  }
  const defs = svgEl("defs");
  const shapeMask = svgEl("mask", { id: `${id}-shape`, maskUnits: "userSpaceOnUse" });
  shapeMask.append(silhouette);
  defs.append(shapeMask);

  const fx = svgEl("g", { mask: `url(#${id}-shape)`, "pointer-events": "none" });
  fx.dataset.triggerFill = "";
  const fill = svgEl("rect", { fill: trigger.fill, "fill-opacity": 0 });
  const max = svgEl("rect", { fill: trigger.maxZone, "fill-opacity": 0 });
  fill.dataset.fill = "";
  max.dataset.maxZone = "";
  fx.append(fill, max);
  const lastBase = bases.at(-1);
  if (lastBase) lastBase.after(defs, fx);
  else rc.svg.prepend(defs, fx);

  let levelRect: SVGElement | null = null;
  if (level) {
    const levelMask = svgEl("mask", { id: `${id}-level`, maskUnits: "userSpaceOnUse", x: -1e5, y: -1e5, width: 2e5, height: 2e5 });
    levelRect = svgEl("rect", { fill: "#fff", width: 0, height: 0 });
    levelMask.append(levelRect);
    defs.append(levelMask);
    level.setAttribute("mask", `url(#${id}-level)`);
    fill.remove();
  }

  // the bases' box in the control's own units (bases share the trigger's coordinate space)
  let box: LocalBox | null = null;
  const measure = (): LocalBox => {
    const host = (lastBase?.parentNode ?? rc.svg) as SVGGraphicsElement;
    const inverse = DOMMatrix.fromMatrix(host.getScreenCTM()!).inverse();
    const rects = (bases.length ? bases : [rc.svg]).map((b) => b.getBoundingClientRect());
    const p1 = inverse.transformPoint({ x: Math.min(...rects.map((r) => r.left)), y: Math.min(...rects.map((r) => r.top)) });
    const p2 = inverse.transformPoint({ x: Math.max(...rects.map((r) => r.right)), y: Math.max(...rects.map((r) => r.bottom)) });
    const b = { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
    setRect(shapeMask, { x: b.x - 4, y: b.y - 4, width: b.w + 8, height: b.h + 8 });
    return b;
  };

  let last = "";
  return {
    /** Shows the 100% zone and the minimum force (from the weak end) without a finger; update() resets it. */
    preview(maxZone: number, minForce: number) {
      last = "";
      box ??= measure();
      setRect(max, band(box, trigger.direction, 1 - maxZone, 1));
      setRect(levelRect ?? fill, band(box, trigger.direction, 0, minForce));
      fill.setAttribute("fill-opacity", "0.55");
      max.setAttribute("fill-opacity", "0.9");
    },
    /** raw = finger position along the trigger (0…1), force = resulting value, maxZone = top zone */
    update(raw: number, force: number, maxZone: number, active: boolean) {
      const key = active ? `${raw}/${force}/${maxZone}` : "off";
      if (key === last) return;
      last = key;
      box ??= measure();
      const top = 1 - maxZone;
      const fillTo = !active ? 0 : raw >= top ? 1 : raw;
      setRect(max, band(box, trigger.direction, top, 1));
      setRect(levelRect ?? fill, band(box, trigger.direction, 0, fillTo));
      fill.setAttribute("fill-opacity", String(active ? 0.3 + 0.7 * force : 0));
      max.setAttribute("fill-opacity", String(active ? 0.12 + 0.88 * force ** 3 : 0));
    },
  };
}
