const KEY = "ninjoy.v1.device";

/**
 * A random identity kept on this device so the host gives the same controller back after a
 * reconnect. Not tied to the player or the hardware; a new one is made when storage is empty
 * or unavailable.
 */
export function deviceId(storage: Storage | null = globalThis.localStorage ?? null): Uint8Array {
  try {
    const saved = storage?.getItem(KEY);
    if (saved && /^[0-9a-f]{32}$/.test(saved)) return Uint8Array.from(saved.match(/../g)!.map((b) => parseInt(b, 16)));
  } catch {
    // storage blocked: use a fresh identity for this page load
  }
  const id = crypto.getRandomValues(new Uint8Array(16));
  try {
    storage?.setItem(KEY, [...id].map((b) => b.toString(16).padStart(2, "0")).join(""));
  } catch {
    // not saved: the next visit gets a new identity
  }
  return id;
}
