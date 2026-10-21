import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { createI18n } from "../../src/i18n/index.ts";
import { keepAwake } from "../../src/platform/wake-lock.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { renderStart } from "../../src/ui/start.ts";
import { mount, stubPlatform } from "./helpers.ts";

function fakeDoc() {
  const listeners = new Set<() => void>();
  return {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    set(v: DocumentVisibilityState) {
      this.visibilityState = v;
      for (const l of listeners) l();
    },
  };
}

describe("tap to play (US1)", () => {
  it("shows the controller number and one large button that starts once", () => {
    let started = 0;
    const screen = renderStart({ i18n: createI18n("pt"), slot: 3, onStart: () => started++ });
    expect(screen.querySelector(".nj-start-slot")!.textContent).toBe("Controle 3");
    const button = screen.querySelector<HTMLButtonElement>(".nj-start-button")!;
    expect(button.textContent).toBe("Tocar para jogar");
    expect(screen.querySelector(".nj-start-tip")!.textContent).toContain("rotação automática");
    button.click();
    button.click();
    expect(started).toBe(1);
  });

  it("keeps the screen awake and asks again when the page comes back", async () => {
    let requests = 0;
    let released = 0;
    const doc = fakeDoc();
    const wakeLock = { request: async () => (requests++, { release: async () => void released++ }) };
    const awake = keepAwake({ wakeLock, doc: doc as never });
    await awake.ready;
    expect(requests).toBe(1);
    expect(awake.active).toBe(true);
    doc.set("hidden");
    expect(awake.active).toBe(false);
    doc.set("visible");
    await Promise.resolve();
    expect(requests).toBe(2);
    awake.release();
    await Promise.resolve();
    expect(released).toBe(1);
  });

  it("does nothing where the wake lock is missing or refused", async () => {
    const none = keepAwake({ wakeLock: null, doc: fakeDoc() as never });
    await none.ready;
    expect(none.active).toBe(false);
    const refused = keepAwake({ wakeLock: { request: () => Promise.reject(new Error("no")) }, doc: fakeDoc() as never });
    await refused.ready;
    expect(refused.active).toBe(false);
  });
});

describe("motion permission on the tap", () => {
  let controller: Controller;
  afterEach(() => controller.dispose());

  it("asks for motion only when gyro is on", async () => {
    const platform = stubPlatform({ motion: "available" });
    controller = createController({ skin: await loadOfficialSkin(), root: mount(932, 430), storage: null, platform });
    controller.requestMotion();
    await Promise.resolve();
    expect(platform.calls.permission).toBe(1);
    expect(platform.calls.fullscreen).toBe(0); // never forced
    controller.updateSettings({ gyro: false });
    controller.requestMotion();
    await Promise.resolve();
    expect(platform.calls.permission).toBe(1);
  });
});
