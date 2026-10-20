import type { Vec3 } from "./state.ts";

/**
 * Device axes → screen axes (x right, y up the screen, z out of the screen toward the player)
 * for the current screen orientation angle, so motion means the same in both landscape
 * directions. At angle 90 the device is turned counterclockwise: its x axis points up the
 * screen and its y axis points left (measured on a phone: gravity +9.8 on screen y when held
 * upright).
 */
export function toControllerFrame(rate: Vec3, accel: Vec3, orientationAngle: number): { rate: Vec3; accel: Vec3 } {
  const a = (orientationAngle * Math.PI) / 180;
  const cos = Math.round(Math.cos(a) * 1e9) / 1e9, sin = Math.round(Math.sin(a) * 1e9) / 1e9;
  const rotate = (v: Vec3): Vec3 => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos, z: v.z });
  return { rate: rotate(rate), accel: rotate(accel) };
}
