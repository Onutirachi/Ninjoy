export type Language = "auto" | "en" | "pt";
/** all: game rumble and button taps; game: only the game's rumble (experimental); buttons: only taps; off: nothing */
export type Vibration = "all" | "game" | "buttons" | "off";
/** game rumble reaches the phone (experimental: games and Steam send it unevenly) */
export const gameVibrates = (v: Vibration) => v === "all" || v === "game";
/** button taps vibrate */
export const tapsVibrate = (v: Vibration) => v === "all" || v === "buttons";
/**
 * Button tap length for a strength 0…1: browsers cannot set the motor's force, so a stronger tap
 * is a longer one (10–60 ms).
 */
export const tapMs = (strength: number) => Math.round(10 + strength * 50);

/** Per-device player settings. Zone fields are absent until the player changes them. */
export interface PlayerSettings {
  size: number | "auto";
  height: number;
  /** finger radius in CSS px */
  finger: number;
  stickDeadZone?: number;
  stickMaxZone?: number;
  triggerMinForce?: number;
  triggerMaxZone?: number;
  gyro: boolean;
  vibration: Vibration;
  /** button tap strength 0…1 (see tapMs) */
  tapStrength: number;
  language: Language;
}

/** Per-control zone override set in edit-layout mode. */
export interface ControlOverride {
  inherit: boolean;
  stickDeadZone?: number;
  stickMaxZone?: number;
  triggerMinForce?: number;
  triggerMaxZone?: number;
}

export const DEFAULT_SETTINGS: PlayerSettings = { size: "auto", height: 0, finger: 14, gyro: true, vibration: "buttons", tapStrength: 0.5, language: "auto" };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const RANGES = {
  stickDeadZone: [0, 0.4],
  stickMaxZone: [0, 0.3],
  triggerMinForce: [0, 0.5],
  triggerMaxZone: [0, 0.5],
  tapStrength: [0, 1],
} as const;

export function clampSettings(s: PlayerSettings): PlayerSettings {
  const out: PlayerSettings = {
    ...s,
    size: s.size === "auto" ? "auto" : clamp(s.size, 0.4, 1),
    height: clamp(s.height, 0, 1),
    finger: clamp(s.finger, 0, 40),
  };
  for (const [key, [min, max]] of Object.entries(RANGES) as [keyof typeof RANGES, readonly [number, number]][]) {
    const v = s[key];
    if (v !== undefined) out[key] = clamp(v, min, max);
  }
  return out;
}

/** Restores settings saved on the device, ignoring anything that does not fit. */
export function settingsFromStorage(saved: Partial<PlayerSettings>): PlayerSettings {
  const merged = { ...DEFAULT_SETTINGS } as PlayerSettings & Record<string, unknown>;
  for (const [key, value] of Object.entries(saved)) {
    if (key === "size" && (value === "auto" || typeof value === "number")) merged.size = value;
    else if (key === "language" && (value === "auto" || value === "en" || value === "pt")) merged.language = value;
    else if (key === "gyro" && typeof value === "boolean") merged.gyro = value;
    else if (key === "vibration" && (value === "all" || value === "game" || value === "buttons" || value === "off")) merged.vibration = value;
    else if (typeof value === "number" && Number.isFinite(value) && (key === "height" || key === "finger" || key in RANGES)) merged[key] = value;
  }
  return clampSettings(merged);
}

interface StickLike { stick?: { tuning: { deadZone: number; maxZone: number } } }
interface TriggerLike { trigger?: { tuning: { maxZone: number; minForce: number } } }

/** Stick zones: control override (when not inheriting) → player setting → skin (resolved). */
export function stickZones(control: StickLike, settings: PlayerSettings, override?: ControlOverride) {
  const own = override && !override.inherit ? override : undefined;
  const skin = control.stick?.tuning ?? { deadZone: 0.1, maxZone: 0.05 };
  return {
    deadZone: own?.stickDeadZone ?? settings.stickDeadZone ?? skin.deadZone,
    maxZone: own?.stickMaxZone ?? settings.stickMaxZone ?? skin.maxZone,
  };
}

/** Trigger zones: control override (when not inheriting) → player setting → skin (resolved). */
export function triggerZones(control: TriggerLike, settings: PlayerSettings, override?: ControlOverride) {
  const own = override && !override.inherit ? override : undefined;
  const skin = control.trigger?.tuning ?? { maxZone: 0.25, minForce: 0 };
  return {
    maxZone: own?.triggerMaxZone ?? settings.triggerMaxZone ?? skin.maxZone,
    minForce: own?.triggerMinForce ?? settings.triggerMinForce ?? skin.minForce,
  };
}
