import { describe, expect, it } from "vitest";
import { createStore } from "../../src/platform/storage.ts";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k); },
    setItem: (k, v) => { data.set(k, String(v)); },
  };
}

const skin = "arcade";

describe("device storage", () => {
  it("uses versioned keys per skin id", () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    store.saveSettings({ finger: 20 });
    store.saveLayout(skin, { g: { dx: 1, dy: 2, scale: 1 } });
    store.saveOverrides(skin, { l2: { inherit: false } });
    expect(storage.getItem("ninjoy.v1.settings")).toBe('{"finger":20}');
    expect(storage.getItem("ninjoy.v1.layout.arcade")).toBe('{"g":{"dx":1,"dy":2,"scale":1}}');
    expect(storage.getItem("ninjoy.v1.overrides.arcade")).toBe('{"l2":{"inherit":false}}');
    expect(store.loadLayout(skin)).toEqual({ g: { dx: 1, dy: 2, scale: 1 } });
  });

  it("falls back to empty values when data is unreadable", () => {
    const storage = memoryStorage();
    storage.setItem("ninjoy.v1.settings", "{broken");
    expect(createStore(storage).loadSettings()).toEqual({});
  });

  it("survives a storage that throws", () => {
    const throwing = { ...memoryStorage(), getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } } as Storage;
    const store = createStore(throwing);
    expect(store.loadSettings()).toEqual({});
    expect(() => store.saveSettings({ finger: 3 })).not.toThrow();
  });
});
