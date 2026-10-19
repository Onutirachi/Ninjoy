import type { Vec3 } from "./state.ts";

/**
 * Device axes → controller axes (x right, y up, z toward the player) for the current screen
 * orientation angle, so "tilt right" means the same in both landscape directions.
 */
export function toControllerFrame(rate: Vec3, accel: Vec3, orientationAngle: number): { rate: Vec3; accel: Vec3 } {
  const a = (orientationAngle * Math.PI) / 180;
  const cos = Math.round(Math.cos(a) * 1e9) / 1e9, sin = Math.round(Math.sin(a) * 1e9) / 1e9;
  const rotate = (v: Vec3): Vec3 => ({ x: v.x * cos + v.y * sin, y: -v.x * sin + v.y * cos, z: v.z });
  return { rate: rotate(rate), accel: rotate(accel) };
}
