/** The part of the Screen Wake Lock API the page uses. */
export interface WakeLockApi {
  request(type: "screen"): Promise<{ release(): Promise<void> }>;
}

/**
 * Keeps the screen on while the page is visible. Browsers drop the lock when the page is
 * hidden, so it is requested again when the page comes back. Silently does nothing where the
 * API is missing or refused (the plain address, older browsers).
 */
export function keepAwake(o: {
  wakeLock?: WakeLockApi | null;
  doc?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
} = {}) {
  const api = o.wakeLock === undefined ? ((navigator as { wakeLock?: WakeLockApi }).wakeLock ?? null) : o.wakeLock;
  const doc = o.doc ?? document;
  let lock: { release(): Promise<void> } | null = null;
  let wanted = true;

  const acquire = async () => {
    if (!api || !wanted || doc.visibilityState !== "visible") return;
    try {
      lock = await api.request("screen");
    } catch {
      lock = null; // refused (battery saver, no user activation): the screen may turn off
    }
  };
  const onVisibility = () => {
    if (doc.visibilityState === "visible") void acquire();
    else lock = null; // released by the browser
  };
  doc.addEventListener("visibilitychange", onVisibility);
  const ready = acquire();

  return {
    ready,
    get active() { return lock !== null; },
    release() {
      wanted = false;
      doc.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {});
      lock = null;
    },
  };
}
