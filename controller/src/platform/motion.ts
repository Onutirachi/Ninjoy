import type { Vec3 } from "../engine/state.ts";

export type MotionSupport = "available" | "insecure" | "none";

export interface MotionSample { rate: Vec3; accel: Vec3; time: number }

export interface MotionAdapter {
  support(): MotionSupport;
  /** iOS asks the player; must be called from a tap. Resolves true when allowed. */
  requestPermission(): Promise<boolean>;
  listen(listener: (sample: MotionSample) => void): () => void;
  /** screen orientation angle in degrees */
  angle(): number;
}

type PermissionEvent = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Rotation rate (°/s) around the device's x, y and z axes. Chrome on Android reports alpha around
 * x, beta around y and gamma around z (measured on a phone: turning it like a steering wheel moves
 * gamma), not alpha around z as the spec text reads.
 */
export function deviceRate(r: { alpha: number | null; beta: number | null; gamma: number | null } | null): Vec3 {
  return { x: r?.alpha ?? 0, y: r?.beta ?? 0, z: r?.gamma ?? 0 };
}

export const browserMotion: MotionAdapter = {
  support() {
    if (typeof DeviceMotionEvent === "undefined") return "none";
    // motion events only fire in secure contexts (HTTPS, served by the host)
    return window.isSecureContext ? "available" : "insecure";
  },
  async requestPermission() {
    const request = (DeviceMotionEvent as PermissionEvent).requestPermission;
    if (!request) return true;
    try {
      return (await request.call(DeviceMotionEvent)) === "granted";
    } catch {
      return false;
    }
  },
  listen(listener) {
    const onMotion = (e: DeviceMotionEvent) => {
      const r = e.rotationRate, a = e.accelerationIncludingGravity;
      listener({
        // acceleration in m/s², +9.8 on the axis pointing up when still
        rate: deviceRate(r),
        accel: { x: a?.x ?? 0, y: a?.y ?? 0, z: a?.z ?? 0 },
        time: e.timeStamp,
      });
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  },
  angle() {
    return screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0;
  },
};
