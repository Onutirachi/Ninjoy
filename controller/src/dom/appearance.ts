import type { RenderedControl } from "./renderer.ts";

const PAINTED = new Set(["path", "circle", "ellipse", "rect", "polygon", "polyline", "line", "text", "tspan", "use"]);

interface Painted {
  shapes: SVGElement[];
  inactive: string | null;
  active: string | null;
}

export interface Look {
  /** pressed / touched */
  active: boolean;
  /** toggles (fullscreen, gyro): on or off; null for every other control */
  on: boolean | null;
}

/**
 * Applies a control's declared looks: per-element colors, label-on/label-off, the pressed
 * element and the glow. The whole control changes at once and only when its look changes.
 */
export function createAppearance(rc: RenderedControl) {
  const { control } = rc;
  const painted: Painted[] = [];
  const byRole = new Map<string, SVGElement[]>();
  for (const element of control.elements) {
    const el = rc.elements.get(element.id);
    if (!el) continue;
    if (element.role) byRole.set(element.role, [...(byRole.get(element.role) ?? []), el]);
    if (element.role === "hitbox" || (!element.colors.inactive && !element.colors.active)) continue;
    // shapes drawn without fill (outlines) keep it that way
    const shapes = [el, ...el.querySelectorAll<SVGElement>("*")].filter((s) => PAINTED.has(s.localName) && getComputedStyle(s).fill !== "none");
    painted.push({ shapes, inactive: element.colors.inactive, active: element.colors.active });
  }
  const labelOn = byRole.get("label-on") ?? [];
  const labelOff = byRole.get("label-off") ?? [];
  const pressed = byRole.get("pressed") ?? [];
  const glowColor = control.glow.color === "active"
    ? control.elements.find((e) => e.role === "base" && e.colors.active)?.colors.active ?? "#ffffff"
    : control.glow.color;
  const toggleActive = control.toggleActive ?? true;
  // a trigger showing its fill only glows; the fill is its active look
  const fillShown = control.type === "trigger" && control.trigger?.showFill === true;

  let current: string | null = null;

  const apply = ({ active, on }: Look) => {
    const looksActive = active || (on === true && toggleActive);
    const key = `${looksActive}/${on}`;
    if (key === current) return;
    current = key;
    for (const p of painted) {
      const color = looksActive && !fillShown ? (p.active ?? p.inactive) : p.inactive;
      for (const s of p.shapes) {
        if (color) s.style.fill = color;
        else s.style.removeProperty("fill");
      }
    }
    // with both icons, label-on shows while on/active and label-off otherwise; a single icon serves both
    if (labelOn.length && labelOff.length) {
      const showOn = on ?? active;
      for (const el of labelOn) el.style.display = showOn ? "" : "none";
      for (const el of labelOff) el.style.display = showOn ? "none" : "";
    }
    for (const el of pressed) el.style.display = looksActive ? "" : "none";
    rc.svg.style.filter = looksActive && control.glow.enabled ? `drop-shadow(0 0 1.5px ${glowColor}) drop-shadow(0 0 4px ${glowColor})` : "";
    rc.svg.toggleAttribute("data-active", looksActive);
  };

  apply({ active: false, on: null });
  return { apply };
}
