export interface VibrationAdapter {
  supported(): boolean;
  /** a duration in ms, an on/off pattern, or 0 to stop */
  vibrate(pattern: number | number[]): void;
}

export const browserVibration: VibrationAdapter = {
  supported: () => typeof navigator.vibrate === "function",
  vibrate(pattern) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // some browsers throw before the first user gesture
    }
  },
};
