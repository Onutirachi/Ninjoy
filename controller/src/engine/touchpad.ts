import type { Vec } from "./stick.ts";

/** At most this many touches are reported, like a real DS4 touchpad. */
export const MAX_TOUCHES = 2;

/**
 * A point inside a touchpad area (0…1 on both axes) on the single DS4 touchpad: the left
 * half covers x 0–0.5, the right half 0.5–1, a full area the whole surface.
 */
export function touchpadPoint(local: Vec, area: "full" | "left" | "right"): Vec {
  const x = Math.min(1, Math.max(0, local.x));
  const y = Math.min(1, Math.max(0, local.y));
  return { x: area === "full" ? x : area === "left" ? x / 2 : 0.5 + x / 2, y };
}

/** Where a touchpad click button touches when no finger is on the touchpad: its half's center. */
export const CLICK_POINT = { left: { x: 0.25, y: 0.5 }, right: { x: 0.75, y: 0.5 } } as const;
