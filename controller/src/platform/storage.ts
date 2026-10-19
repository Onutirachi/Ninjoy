import type { LayoutEdit } from "../engine/layout.ts";
import type { ControlOverride, PlayerSettings } from "../engine/settings.ts";

const PREFIX = "ninjoy.v1";
const skinKey = (skin: { name: string; version: string }) => `${skin.name}@${skin.version}`;

export interface Store {
  loadSettings(): Partial<PlayerSettings>;
  saveSettings(settings: Partial<PlayerSettings>): void;
  loadLayout(skin: { name: string; version: string }): Record<string, LayoutEdit>;
  saveLayout(skin: { name: string; version: string }, layout: Record<string, LayoutEdit>): void;
  loadOverrides(skin: { name: string; version: string }): Record<string, ControlOverride>;
  saveOverrides(skin: { name: string; version: string }, overrides: Record<string, ControlOverride>): void;
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
  return {
    loadSettings: () => read(`${PREFIX}.settings`),
    saveSettings: (s) => write(`${PREFIX}.settings`, s),
    loadLayout: (skin) => read(`${PREFIX}.layout.${skinKey(skin)}`),
    saveLayout: (skin, layout) => write(`${PREFIX}.layout.${skinKey(skin)}`, layout),
    loadOverrides: (skin) => read(`${PREFIX}.overrides.${skinKey(skin)}`),
    saveOverrides: (skin, overrides) => write(`${PREFIX}.overrides.${skinKey(skin)}`, overrides),
  };
}
