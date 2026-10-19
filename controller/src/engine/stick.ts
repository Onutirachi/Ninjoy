import { applyZones } from "./zones.ts";

export interface Vec { x: number; y: number }

/**
 * Stick value from the finger offset to the stick center. `travel` is the half-size of the
 * ellipse the thumb's center can reach (per axis). Outside the ellipse the finger keeps
 * working: the offset is clamped onto it. Zones are radial.
 */
export function stickValue(offset: Vec, travel: Vec, zones: { deadZone: number; maxZone: number }): { x: number; y: number; clamped: Vec } {
  const tx = Math.max(1e-6, travel.x), ty = Math.max(1e-6, travel.y);
  let { x: dx, y: dy } = offset;
  let k = Math.hypot(dx / tx, dy / ty);
  if (k > 1) {
    dx /= k;
    dy /= k;
    k = 1;
  }
  const scale = k > 0 ? applyZones(k, zones.deadZone, zones.maxZone) / k : 0;
  return { x: (dx / tx) * scale, y: (dy / ty) * scale, clamped: { x: dx, y: dy } };
}
