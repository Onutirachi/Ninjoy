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

type Dir = "up" | "down" | "left" | "right";
/** The 8 d-pad directions, clockwise from right (screen y points down). */
const SECTORS: Dir[][] = [["right"], ["down", "right"], ["down"], ["down", "left"], ["left"], ["up", "left"], ["up"], ["up", "right"]];
const SECTOR = Math.PI / 4;
/** a held direction keeps going this far past its border, so it does not flicker */
const HYSTERESIS = (7.5 * Math.PI) / 180;

/**
 * D-pad directions for a zoned stick value (0,0 inside the dead zone): the nearest of 8, keeping
 * the previous sector until the angle is clearly past its border.
 */
export function dpadDirections(x: number, y: number, previous: number | null): { sector: number | null; dirs: Set<Dir> } {
  if (x === 0 && y === 0) return { sector: null, dirs: new Set() };
  const angle = Math.atan2(y, x);
  let sector = ((Math.round(angle / SECTOR) % 8) + 8) % 8;
  if (previous !== null && previous !== sector) {
    const center = previous * SECTOR;
    const off = Math.abs(Math.atan2(Math.sin(angle - center), Math.cos(angle - center)));
    if (off <= SECTOR / 2 + HYSTERESIS) sector = previous;
  }
  return { sector, dirs: new Set(SECTORS[sector]) };
}
