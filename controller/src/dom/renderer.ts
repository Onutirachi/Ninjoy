import type { Anchor, ResolvedControl, ResolvedSkin } from "@ninjoy/skin-format";
import { CANVAS_H, fixedLine, groupTransform, viewWidth, type LayoutEdit } from "../engine/layout.ts";

export const SVG_NS = "http://www.w3.org/2000/svg";

export interface RenderedControl {
  control: ResolvedControl;
  /** the control's nested <svg>, placed at its box */
  svg: SVGSVGElement;
  /** skin element id → element */
  elements: Map<string, SVGElement>;
}

export interface RenderedGroup {
  name: string;
  anchor: Anchor;
  el: SVGGElement;
  /** center of the group's boxes on the canvas */
  center: { x: number; y: number };
  /** keeps the default layout's place and size (ignores the player's size and height) */
  fixed: boolean;
  /** the group's boxes on the canvas */
  bounds: { left: number; top: number; right: number; bottom: number };
}

export interface LayoutParams {
  size: number;
  height: number;
  edits: Record<string, LayoutEdit>;
  /** the automatic size, where fixed groups stay */
  defaultSize: number;
}

export interface Rendered {
  background: HTMLElement;
  stage: HTMLElement;
  svg: SVGSVGElement;
  controls: RenderedControl[];
  groups: RenderedGroup[];
  /** screen aspect ratio of the last layout */
  aspect: number;
  /** re-applies the view box and group transforms only */
  relayout(params: LayoutParams): void;
  dispose(): void;
}

const SKIPPED_ROOT_ATTRIBUTES = new Set(["xmlns", "xmlns:xlink", "x", "y", "width", "height", "viewBox", "version", "id"]);

/** Draws a resolved skin into `root`: a background layer and a stage holding one root SVG. */
export function render(skin: ResolvedSkin, root: HTMLElement): Rendered {
  if (getComputedStyle(root).position === "static") root.style.position = "relative";

  const background = document.createElement("div");
  background.dataset.background = "";
  Object.assign(background.style, { position: "absolute", inset: "0", pointerEvents: "none" });
  if (skin.background) {
    background.style.backgroundColor = skin.background.color;
    background.style.opacity = String(skin.background.opacity);
  }

  const stage = document.createElement("div");
  stage.dataset.stage = "";
  Object.assign(stage.style, { position: "absolute", inset: "0", touchAction: "none", userSelect: "none", webkitUserSelect: "none", overflow: "hidden" });

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("preserveAspectRatio", "none");
  Object.assign(svg.style, { display: "block", width: "100%", height: "100%", overflow: "visible" });
  stage.append(svg);
  root.append(background, stage);

  const byId = new Map(skin.controls.map((c) => [c.id, c]));
  const controls: RenderedControl[] = [];
  const groups: RenderedGroup[] = skin.groups.map((group) => {
    const el = document.createElementNS(SVG_NS, "g");
    el.dataset.group = group.name;
    const members = group.controls.map((id) => byId.get(id)).filter((c): c is ResolvedControl => c !== undefined);
    for (const control of members) {
      const rendered = renderControl(control);
      controls.push(rendered);
      el.append(rendered.svg);
    }
    svg.append(el);
    return { name: group.name, anchor: group.anchor, el, center: centerOf(members), fixed: group.fixed, bounds: boundsOf(members) };
  });
  // a group that resizes and sits over a fixed group stands on it (SH/OP over a fixed PS)
  const standsOn = new Map<RenderedGroup, number>();
  for (const group of groups) {
    if (group.fixed) continue;
    const below = groups.filter((f) => f.fixed && f.anchor === group.anchor && f.bounds.top >= group.bounds.bottom - 1 && f.bounds.left < group.bounds.right && f.bounds.right > group.bounds.left);
    if (below.length) standsOn.set(group, Math.min(...below.map((f) => f.bounds.top)));
  }
  // keep skin order for everything that iterates controls
  const order = new Map(skin.controls.map((c, i) => [c.id, i]));
  controls.sort((a, b) => order.get(a.control.id)! - order.get(b.control.id)!);

  const rendered: Rendered = {
    background, stage, svg, controls, groups, aspect: 1,
    relayout({ size, height, defaultSize, edits }) {
      const { width, height: h } = root.getBoundingClientRect();
      const aspect = h > 0 ? width / h : 1;
      rendered.aspect = aspect;
      svg.setAttribute("viewBox", `0 0 ${viewWidth(aspect)} ${CANVAS_H}`);
      for (const group of groups) {
        const line = standsOn.get(group);
        const rest = line === undefined ? undefined : { y: line, at: fixedLine(line, aspect, defaultSize) };
        const m = group.fixed
          ? groupTransform({ aspect, size: defaultSize, height: 0, group, edit: edits[group.name] })
          : groupTransform({ aspect, size, height, group, edit: edits[group.name], rest });
        group.el.setAttribute("transform", `matrix(${m.join(" ")})`);
      }
    },
    dispose() {
      background.remove();
      stage.remove();
    },
  };
  return rendered;
}

function boundsOf(controls: ResolvedControl[]) {
  if (!controls.length) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.min(...controls.map((c) => c.box.x)),
    top: Math.min(...controls.map((c) => c.box.y)),
    right: Math.max(...controls.map((c) => c.box.x + c.box.width)),
    bottom: Math.max(...controls.map((c) => c.box.y + c.box.height)),
  };
}

function centerOf(controls: ResolvedControl[]) {
  const { left, top, right, bottom } = boundsOf(controls);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

/**
 * The control's SVG as a nested <svg> at its box. Ids are prefixed with the control id so
 * several controls can use the same names; references to them are rewritten.
 */
function renderControl(control: ResolvedControl): RenderedControl {
  const doc = new DOMParser().parseFromString(control.svg.text, "image/svg+xml");
  const source = doc.documentElement;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.dataset.control = control.id;
  for (const attr of source.attributes) if (!SKIPPED_ROOT_ATTRIBUTES.has(attr.name)) svg.setAttribute(attr.name, attr.value);
  const viewBox = source.getAttribute("viewBox");
  if (viewBox) svg.setAttribute("viewBox", viewBox);
  const { x, y, width, height } = control.box;
  for (const [k, v] of Object.entries({ x, y, width, height })) svg.setAttribute(k, String(v));
  svg.style.overflow = "visible";

  const prefix = `nj-${control.id}--`;
  const ids = new Set([...source.querySelectorAll("[id]")].map((el) => el.id));
  const rewrite = (value: string) =>
    value
      .replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (m, q: string, id: string) => (ids.has(id) ? `url(${q}#${prefix}${id}${q})` : m))
      .replace(/#([\w.:-]+)/g, (m, id: string) => (ids.has(id) ? `#${prefix}${id}` : m));

  const elements = new Map<string, SVGElement>();
  for (const el of source.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      if (attr.name === "id") continue;
      if (attr.name === "href" || attr.name === "xlink:href" || attr.name === "style" || attr.value.includes("url(")) {
        el.setAttribute(attr.name, rewrite(attr.value));
      }
    }
    if (el.localName === "style") {
      // keep the control's own CSS from leaking to other controls
      el.textContent = `[data-control="${control.id}"] { ${rewrite(el.textContent ?? "")} }`;
    }
  }
  for (const el of source.querySelectorAll("[id]")) {
    const id = el.id;
    el.id = prefix + id;
    el.setAttribute("data-el", id);
  }
  for (const child of [...source.childNodes]) svg.append(document.importNode(child, true));
  for (const el of svg.querySelectorAll<SVGElement>("[data-el]")) elements.set(el.getAttribute("data-el")!, el);
  return { control, svg, elements };
}
