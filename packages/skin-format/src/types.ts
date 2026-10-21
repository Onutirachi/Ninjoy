import type { ReportCode } from "./report.ts";

// ---------- files ----------

/** Read-only view of a skin package. Paths are relative and '/'-separated. */
export interface SkinFiles {
  list(): string[];
  read(path: string): Promise<Uint8Array>;
  /** Total uncompressed size, when known before reading (archives). */
  size?(): number;
}

// ---------- vocabulary ----------

export type Anchor = "left" | "center" | "right";

export type Binding =
  | "cross" | "circle" | "square" | "triangle"
  | "up" | "down" | "left" | "right"
  | "l1" | "r1" | "l2" | "r2" | "l3" | "r3"
  | "share" | "options" | "ps"
  | "touchpad" | "touchpad-left" | "touchpad-right";

export type Role =
  | "base" | "label" | "label-on" | "label-off"
  | "thumb" | "thumb-label" | "hitbox" | "pressed" | "level";

/** "decor" draws but takes no touches and sends nothing (format 2). */
export type ControlType = "button" | "stick" | "trigger" | "touchpad" | "system" | "decor";
/** What a stick sends: the analog stick, or the d-pad in 8 directions (format 2). */
export type StickOutput = "analog" | "dpad";
export type Direction = "up" | "down" | "left" | "right";
export type Placement = "cover" | "contain" | "center" | "tile";
export type SystemAction = "menu" | "fullscreen" | "gyro";

// ---------- manifest (as written in skin.json) ----------

export interface ColorPair { inactive?: string; active?: string }
export interface Glow { enabled?: boolean; color?: string }
export interface TriggerTuning { maxZone?: number; minForce?: number }
export interface StickTuning { deadZone?: number; maxZone?: number }
export interface Box { x: number; y: number; width: number; height: number }

export interface ManifestElement { role?: Role; colors?: ColorPair }

export interface ManifestControl {
  id: string;
  type: ControlType;
  svg: string;
  box: Box;
  elements?: Record<string, ManifestElement>;
  anchor?: Anchor;
  glow?: Glow;
  bindings?: Binding[];
  side?: "left" | "right";
  click?: Binding | "none";
  trigger?: "l2" | "r2";
  direction?: Direction;
  colors?: { fill?: string; maxZone?: string };
  showFill?: boolean;
  tuning?: TriggerTuning & StickTuning;
  area?: "full" | "left" | "right";
  action?: SystemAction;
  toggleActive?: boolean;
  /** keeps its default-layout place and size whatever the player's size and height (format 2) */
  fixed?: boolean;
  output?: StickOutput;
}

export interface Manifest {
  format: number;
  name: string;
  author: string;
  version: string;
  orientation: "landscape";
  preview?: string;
  background?: { color?: string; image?: string; placement?: Placement; opacity?: number };
  defaults?: {
    colors?: Partial<Record<Role, ColorPair>>;
    trigger?: { fill?: string; maxZone?: string; showFill?: boolean };
    glow?: Glow;
    toggleActive?: boolean;
    tuning?: { trigger?: TriggerTuning; stick?: StickTuning };
    stick?: { output?: StickOutput };
  };
  groups?: { name: string; anchor?: Anchor; controls: string[] }[];
  controls: ManifestControl[];
  [extra: string]: unknown;
}

// ---------- report ----------

export type Severity = "error" | "warning" | "info";

export interface ReportEntry {
  severity: Severity;
  code: ReportCode;
  params: Record<string, string | number>;
}

// ---------- result ----------

export interface ResolvedElement {
  id: string;
  /** null = decoration */
  role: Role | null;
  /**
   * A CSS color (the lightbar color is `var(--ninjoy-lightbar)`, alone or mixed with
   * transparency), or null = keep the color drawn in the SVG.
   */
  colors: { inactive: string | null; active: string | null };
}

export interface ResolvedControl {
  id: string;
  type: ControlType;
  /** validated, unmodified SVG source */
  svg: { path: string; text: string };
  box: Box;
  anchor: Anchor;
  /** group name; ungrouped controls form an implicit group named after the control */
  group: string;
  fixed: boolean;
  elements: ResolvedElement[];
  glow: { enabled: boolean; color: string };
  bindings?: Binding[];
  side?: "left" | "right";
  trigger?: {
    which: "l2" | "r2";
    direction: Direction;
    showFill: boolean;
    fill: string;
    maxZone: string;
    tuning: { maxZone: number; minForce: number };
  };
  stick?: { click: Binding | "none"; output: StickOutput; tuning: { deadZone: number; maxZone: number } };
  area?: "full" | "left" | "right";
  action?: SystemAction;
  /** fullscreen and gyro only */
  toggleActive?: boolean;
}

export interface ResolvedSkin {
  canvas: { width: 1600; height: 720 };
  meta: { name: string; author: string; version: string; format: 1 | 2 };
  background: { color: string; image?: string; placement: Placement; opacity: number } | null;
  preview?: string;
  controls: ResolvedControl[];
  /** fixed groups ignore the player's size and height */
  groups: { name: string; anchor: Anchor; fixed: boolean; controls: string[] }[];
}

export type LoadResult =
  | { ok: true; skin: ResolvedSkin; report: ReportEntry[] }
  | { ok: false; report: ReportEntry[] };
