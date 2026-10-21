import type { LayoutEdit } from "../engine/layout.ts";
import type { ControlOverride, PlayerSettings } from "../engine/settings.ts";

const PREFIX = "ninjoy.v1";
/** the official skin's edits were kept as "Ninjoy@<version>" before skins had ids */
const LEGACY_OFFICIAL = "Ninjoy@";

export interface Store {
  loadSettings(): Partial<PlayerSettings>;
  saveSettings(settings: Partial<PlayerSettings>): void;
  /** per skin id */
  loadLayout(skinId: string): Record<string, LayoutEdit>;
  saveLayout(skinId: string, layout: Record<string, LayoutEdit>): void;
  loadOverrides(skinId: string): Record<string, ControlOverride>;
  saveOverrides(skinId: string, overrides: Record<string, ControlOverride>): void;
}

/**
 * Per-device persistence. Never throws: unreadable data or unavailable storage (private mode,
 * blocked site data) simply behaves as empty. Pass null to keep everything in memory.
 */
export function createStore(storage: Storage | null = globalThis.localStorage ?? null): Store {
  const read = <T extends object>(key: string): T => {
    try {
      const raw = storage?.getItem(key);
      const value: unknown = raw ? JSON.parse(raw) : {};
      return (value && typeof value === "object" ? value : {}) as T;
    } catch {
      return {} as T;
    }
  };
  const write = (key: string, value: object) => {
    try {
      storage?.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked: settings stay in memory for this session
    }
  };
  /** A skin's data; the official skin falls back to its edits saved before skins had ids. */
  const readSkin = <T extends object>(kind: string, id: string): T => {
    const own = read<T>(`${PREFIX}.${kind}.${id}`);
    if (Object.keys(own).length || id !== "ninjoy" || !storage) return own;
    try {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i) ?? "");
      const legacy = keys.filter((k) => k.startsWith(`${PREFIX}.${kind}.${LEGACY_OFFICIAL}`)).sort().at(-1);
      return legacy ? read<T>(legacy) : own;
    } catch {
      return own;
    }
  };
  return {
    loadSettings: () => read(`${PREFIX}.settings`),
    saveSettings: (s) => write(`${PREFIX}.settings`, s),
    loadLayout: (id) => readSkin("layout", id),
    saveLayout: (id, layout) => write(`${PREFIX}.layout.${id}`, layout),
    loadOverrides: (id) => readSkin("overrides", id),
    saveOverrides: (id, overrides) => write(`${PREFIX}.overrides.${id}`, overrides),
  };
}
