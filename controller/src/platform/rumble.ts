import { browserVibration, type VibrationAdapter } from "./vibration.ts";

/** Browsers can only switch vibration on and off, so intensity becomes pulse length. */
export const CYCLE_MS = 100;
/** Pattern length sent at a time; refreshed while the rumble lasts. */
const PATTERN_CYCLES = 12;

/**
 * Rumble (strong, weak motor 0…255) → on/off pattern for one cycle; `null` = stop.
 * The stronger motor sets the length: full rumble vibrates the whole cycle.
 */
export function rumblePulse(strong: number, weak: number): [number, number] | null {
  const level = Math.max(strong, weak) / 255;
  if (level <= 0) return null;
  const on = Math.max(10, Math.round(level * CYCLE_MS));
  return [on, CYCLE_MS - on];
}

/** Turns rumble messages into vibration while the page is visible and connected. */
export function createRumble(o: { vibration?: VibrationAdapter; onUnsupported?(): void } = {}) {
  const vibration = o.vibration ?? browserVibration;
  let refresh = 0;
  let warned = false;
  /** browsers report vibrate() calls before the first tap as errors: only stop what was started */
  let vibrating = false;

  const stop = () => {
    clearInterval(refresh);
    refresh = 0;
    if (vibrating) vibration.vibrate(0);
    vibrating = false;
  };

  return {
    /** strong, weak in 0…255 */
    set(strong: number, weak: number) {
      const pulse = rumblePulse(strong, weak);
      if (!pulse) return stop();
      if (!vibration.supported()) {
        if (!warned) o.onUnsupported?.();
        warned = true;
        return;
      }
      vibrating = true;
      const pattern = Array.from({ length: PATTERN_CYCLES }, () => pulse).flat();
      // a pattern ending on "off" would just stop; drop the last pause
      if (pulse[1] === 0) vibration.vibrate(CYCLE_MS * PATTERN_CYCLES);
      else vibration.vibrate(pattern.slice(0, -1));
      clearInterval(refresh);
      refresh = window.setInterval(() => vibration.vibrate(pulse[1] === 0 ? CYCLE_MS * PATTERN_CYCLES : pattern.slice(0, -1)), CYCLE_MS * PATTERN_CYCLES - CYCLE_MS);
    },
    /** page hidden or disconnected */
    stop,
  };
}
