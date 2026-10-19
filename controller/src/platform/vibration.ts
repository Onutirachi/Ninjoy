export interface VibrationAdapter {
  supported(): boolean;
  vibrate(ms: number): void;
}

export const browserVibration: VibrationAdapter = {
  supported: () => typeof navigator.vibrate === "function",
  vibrate(ms) {
    try {
      navigator.vibrate?.(ms);
    } catch {
      // some browsers throw before the first user gesture
    }
  },
};
