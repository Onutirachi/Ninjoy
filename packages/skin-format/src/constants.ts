/** The reference canvas every skin is drawn on (20:9). */
export const CANVAS = { width: 1600, height: 720 } as const;

/** Maximum total size of a skin package. */
export const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;

/** The manifest file at the root of every package. */
export const MANIFEST_PATH = "skin.json";

/** The only manifest format this version understands. */
export const FORMAT_VERSION = 1;

/** Built-in values used when neither the control nor the skin defaults declare one. */
export const BUILTIN = {
  trigger: { maxZone: 0.25, minForce: 0, fill: "#3099E8", showFill: true },
  stick: { deadZone: 0.1, maxZone: 0.05 },
  glow: { enabled: true, color: "active" },
  toggleActive: true,
  background: { color: "#000000", placement: "cover", opacity: 1 },
} as const;
