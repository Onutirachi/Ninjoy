import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { createI18n, type I18n } from "../../src/i18n/index.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { createEditToolbar } from "../../src/ui/edit-mode.ts";
import { createMenu } from "../../src/ui/menu.ts";
import { at, mount, pressed, stubPlatform, touch } from "./helpers.ts";
import "../../src/ui/styles.css";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

/** Checks a radio option of a group (by its input name) and fires `change`. */
function pick(scope: HTMLElement, name: string, value: string) {
  const input = scope.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;
  input.checked = true;
  input.dispatchEvent(new Event("change"));
}

/** Sets a range input by its label text and fires `input`. */
function setSlider(scope: HTMLElement, label: string, value: number) {
  const row = [...scope.querySelectorAll<HTMLElement>(".nj-row")].find((r) => [...r.querySelectorAll("span")].some((s) => s.textContent === label));
  if (!row) throw new Error(`no slider "${label}"`);
  const input = row.querySelector<HTMLInputElement>('input[type="range"]')!;
  input.value = String(value);
  input.dispatchEvent(new Event("input"));
}

describe("player menu (US6)", () => {
  let controller: Controller;
  let root: HTMLElement;
  let menu: ReturnType<typeof createMenu>;
  let toolbar: ReturnType<typeof createEditToolbar>;
  let i18n: I18n;

  const start = async (storage: Storage | null = null) => {
    const skin = await loadOfficialSkin();
    root = mount(1600, 720);
    i18n = createI18n("en");
    controller = createController({ skin, root, storage, platform: stubPlatform(), onMenu: () => menu.show() });
    controller.updateSettings({ size: 1, finger: 0 });
    menu = createMenu({ controller, skin, i18n: () => i18n, onLanguage: (l) => (i18n = createI18n(l === "pt" ? "pt" : "en")), onEditLayout: () => controller.setEditMode(true), parent: root });
    toolbar = createEditToolbar({ controller, skin, i18n: () => i18n, parent: root });
    return skin;
  };
  const panel = () => root.querySelector<HTMLElement>(".nj-overlay")!;
  // left L2 trigger, 30% up from its bottom
  const l2 = () => at(root, "l2-left", 0.5, 0.7);
  afterEach(() => {
    toolbar.dispose();
    menu.dispose();
    controller.dispose();
  });

  it("opens from the menu control and releases every control", async () => {
    await start();
    const held = touch(root).down(...at(root, "cross"));
    touch(root).down(...at(root, "menu")).up();
    expect(menu.open).toBe(true);
    expect(pressed(controller)).toEqual([]);
    held.up();
  });

  it("applies the finger size to hit testing at once", async () => {
    await start();
    menu.show();
    const [x, y] = at(root, "cross");
    setSlider(panel(), "Finger size", 10);
    menu.close();
    const near = touch(root).down(x, y + 70.32 + 5); // 5 px outside the drawn edge
    expect(pressed(controller)).toEqual(["cross"]);
    near.up();
  });

  it("changes the zones of every inheriting trigger, and an override changes only its trigger", async () => {
    await start();
    let f = touch(root).down(...l2());
    const before = controller.state.triggers.l2;
    f.up();
    menu.show();
    setSlider(panel(), "100% zone (top)", 50);
    menu.close();
    f = touch(root).down(...l2());
    const after = controller.state.triggers.l2;
    f.up();
    expect(after).toBeGreaterThan(before);

    // edit mode: L2 left stops inheriting, starting from the menu values
    controller.setEditMode(true);
    touch(root).down(...at(root, "l2-left")).up();
    const bar = root.querySelector<HTMLElement>(".nj-edit")!;
    const tuning = [...bar.querySelectorAll("details")].find((d) => d.textContent?.includes("Zones of L2"))!;
    tuning.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    expect(controller.override("l2-left")).toMatchObject({ inherit: false, triggerMaxZone: 0.5 });
    const fresh = [...root.querySelectorAll<HTMLElement>(".nj-edit details")].find((d) => d.textContent?.includes("Zones of L2"))!;
    setSlider(fresh, "Trigger 100% zone (top)", 0);
    controller.setEditMode(false);
    f = touch(root).down(...l2());
    expect(controller.state.triggers.l2).toBeLessThan(before);
    f.up();
    // the other L2 still inherits the menu
    f = touch(root).down(...at(root, "l2-right", 0.5, 0.95));
    expect(controller.state.triggers.l2).toBeGreaterThan(0);
    f.up();
    expect(controller.override("l2-right")).toBeUndefined();
  });

  it("shows the menu in the chosen language", async () => {
    await start();
    i18n = createI18n("pt");
    menu.show();
    expect(panel().querySelector("h2")!.textContent).toBe("Menu do Ninjoy");
    expect([...panel().querySelectorAll(".nj-tab")].map((t) => t.textContent)).toEqual(["Layout", "Toque", "Movimento", "Vibração", "Geral"]);
    pick(panel(), "nj-language", "en");
    expect(panel().querySelector("h2")!.textContent).toBe("Ninjoy menu");
    expect(controller.settings.language).toBe("en");
  });

  it("keeps every setting across a reload and never changes the skin", async () => {
    const storage = memoryStorage();
    const skin = await start(storage);
    const original = JSON.stringify(skin);
    menu.show();
    setSlider(panel(), "Controller size", 70);
    setSlider(panel(), "Controller height", 40);
    setSlider(panel(), "Finger size", 20);
    setSlider(panel(), "Dead zone (center)", 20);
    setSlider(panel(), "100% zone (edge)", 10);
    setSlider(panel(), "Minimum force", 15);
    setSlider(panel(), "100% zone (top)", 30);
    menu.close();
    controller.setOverride("stick-left", { inherit: false, stickDeadZone: 0.3, stickMaxZone: 0 });
    const saved = controller.settings;
    toolbar.dispose();
    menu.dispose();
    controller.dispose();

    root = mount(1600, 720);
    controller = createController({ skin, root, storage, platform: stubPlatform() });
    menu = createMenu({ controller, skin, i18n: () => i18n, onLanguage: () => {}, onEditLayout: () => {}, parent: root });
    toolbar = createEditToolbar({ controller, skin, i18n: () => i18n, parent: root });
    expect(controller.settings).toEqual(saved);
    expect(saved).toMatchObject({ size: 0.7, height: 0.4, finger: 20, stickDeadZone: 0.2, stickMaxZone: 0.1, triggerMinForce: 0.15, triggerMaxZone: 0.3 });
    expect(controller.override("stick-left")).toEqual({ inherit: false, stickDeadZone: 0.3, stickMaxZone: 0 });
    expect(JSON.stringify(skin)).toBe(original);
  });
});

describe("menu redesign", () => {
  let controller: Controller;
  let root: HTMLElement;
  let menu: ReturnType<typeof createMenu>;
  let i18n: I18n;
  let platform: ReturnType<typeof stubPlatform>;

  const start = async (o: { platform?: Parameters<typeof stubPlatform>[0]; slot?: number | null } = {}) => {
    const skin = await loadOfficialSkin();
    root = mount(1600, 720);
    i18n = createI18n("en");
    platform = stubPlatform({ motion: "available", ...o.platform });
    controller = createController({ skin, root, storage: null, platform });
    controller.updateSettings({ size: 1, finger: 0 });
    menu = createMenu({
      controller, skin, i18n: () => i18n, slot: () => o.slot ?? null, parent: root,
      onLanguage: (l) => (i18n = createI18n(l === "pt" ? "pt" : "en")), onEditLayout: () => {},
    });
    menu.show();
  };
  const overlay = () => root.querySelector<HTMLElement>(".nj-overlay")!;
  const shown = () => overlay().querySelector<HTMLElement>(".nj-section:not([hidden])")!;
  const tab = (name: string) => [...overlay().querySelectorAll<HTMLButtonElement>(".nj-tab")].find((t) => t.textContent === name)!;
  const input = (label: string) =>
    [...overlay().querySelectorAll<HTMLElement>(".nj-row")].find((r) => [...r.querySelectorAll("span")].some((s) => s.textContent === label))!.querySelector<HTMLInputElement>("input")!;
  afterEach(() => {
    menu.dispose();
    controller.dispose();
  });

  it("shows the wordmark, the controller number and a plain close button", async () => {
    await start({ slot: 2 });
    expect(overlay().querySelector(".nj-menu-word svg")).not.toBeNull();
    expect(overlay().querySelector(".nj-menu-slot")!.textContent).toBe("2Controller");
    overlay().querySelector<HTMLButtonElement>(".nj-close")!.click();
    expect(menu.open).toBe(false);
    menu.dispose();
    controller.dispose();
    await start({ slot: null });
    expect(overlay().querySelector(".nj-menu-slot")).toBeNull();
  });

  it("shows one section at a time and keeps it across a language change", async () => {
    await start();
    expect(overlay().querySelectorAll(".nj-section:not([hidden])")).toHaveLength(1);
    expect(shown().querySelector("h3")!.textContent).toBe("Layout");
    tab("Touch").click();
    expect(shown().querySelector("h3")!.textContent).toBe("Touch");
    expect(tab("Touch").getAttribute("aria-selected")).toBe("true");
    tab("General").click();
    pick(overlay(), "nj-language", "pt");
    expect(shown().querySelector("h3")!.textContent).toBe("Geral");
  });

  it("gives every control a finger-sized target", async () => {
    await start();
    for (const name of ["Layout", "Touch", "Motion", "Vibration", "General"]) {
      tab(name).click();
      const targets = [tab(name), overlay().querySelector(".nj-close")!, ...shown().querySelectorAll("button, input[type=range], .nj-choice, .nj-switch-row")];
      for (const target of targets) {
        const r = target.getBoundingClientRect();
        expect(Math.min(r.width, r.height), `${name}: ${target.textContent || target.className}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it("shows gyro and vibration disabled with the reason when the device lacks them", async () => {
    await start({ platform: { motion: "none", vibration: false } });
    tab("Motion").click();
    expect(shown().querySelector<HTMLInputElement>(".nj-switch")!.disabled).toBe(true);
    expect(shown().textContent).toContain("no motion sensor");
    tab("Vibration").click();
    expect(shown().querySelector(".nj-reason")!.textContent).toContain("does not support vibration");
    expect([...shown().querySelectorAll<HTMLInputElement>("input")].every((i) => i.disabled)).toBe(true);
  });

  it("adjusts size and height with vertical sliders", async () => {
    await start();
    for (const label of ["Controller size", "Controller height"]) {
      const slider = input(label);
      expect(getComputedStyle(slider).writingMode).toBe("vertical-lr");
      const r = slider.getBoundingClientRect();
      expect(r.height).toBeGreaterThan(r.width * 2);
    }
  });

  it("turns see-through while a slider is dragged and comes back on release", async () => {
    await start();
    const size = input("Controller size");
    size.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(overlay().classList.contains("nj-peek")).toBe(true);
    expect(size.closest(".nj-row")!.classList.contains("dragging")).toBe(true);
    await new Promise((r) => setTimeout(r, 250)); // fade
    expect(getComputedStyle(overlay().querySelector(".nj-rail")!).opacity).toBe("0");
    expect(getComputedStyle(input("Controller height").closest(".nj-row")!).opacity).toBe("0");
    expect(getComputedStyle(size.closest(".nj-row")!).opacity).toBe("1");
    expect(getComputedStyle(overlay()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    window.dispatchEvent(new PointerEvent("pointercancel"));
    expect(overlay().classList.contains("nj-peek")).toBe(false);
    expect(size.closest(".nj-row")!.classList.contains("dragging")).toBe(false);
    // keyboard changes keep the menu
    size.focus();
    size.value = "80";
    size.dispatchEvent(new Event("input"));
    expect(overlay().classList.contains("nj-peek")).toBe(false);
    expect(controller.settings.size).toBe(0.8);
  });

  it("draws the stick zones from the values while a stick zone slider is dragged", async () => {
    await start();
    controller.setOverride("stick-left", { inherit: false, stickDeadZone: 0.3, stickMaxZone: 0 });
    tab("Touch").click();
    const dead = input("Dead zone (center)");
    dead.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const ratio = () => [...document.querySelectorAll<HTMLElement>(".nj-zones .nj-zone-dead")].map((d, i) =>
      d.getBoundingClientRect().width / document.querySelectorAll<HTMLElement>(".nj-zones .nj-zone-max")[i]!.getBoundingClientRect().width);
    expect(ratio()).toHaveLength(2);
    expect(ratio()[0]).toBeCloseTo(0.3, 2); // the override
    expect(ratio()[1]).toBeCloseTo(0.1, 2); // the skin default
    dead.value = "20";
    dead.dispatchEvent(new Event("input"));
    expect(ratio()[1]).toBeCloseTo(0.2, 2);
    window.dispatchEvent(new PointerEvent("pointerup"));
    expect(document.querySelector(".nj-zones")).toBeNull();
  });

  it("draws the trigger zones while a trigger zone slider is dragged", async () => {
    await start();
    tab("Touch").click();
    const max = input("100% zone (top)");
    max.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    const bands = document.querySelectorAll<HTMLElement>(".nj-zones .nj-zone-band");
    expect(bands).toHaveLength(4);
    const l2 = root.querySelector<SVGElement>('svg[data-control="l2-left"]')!.getBoundingClientRect();
    const band = [...bands].find((b) => Math.abs(b.getBoundingClientRect().left - l2.left) < 30)!.getBoundingClientRect();
    expect(band.top).toBeCloseTo(l2.top, -1); // strong end at the top
    expect(band.height / l2.height).toBeCloseTo(0.25, 1);
    window.dispatchEvent(new PointerEvent("pointerup"));
    expect(document.querySelector(".nj-zones")).toBeNull();
  });

  it("offers four vibration modes and taps the strength while dragging, at most every 150 ms", async () => {
    await start();
    tab("Vibration").click();
    const options = [...shown().querySelectorAll(".nj-choice")];
    expect(options.map((o) => o.querySelector("strong")!.firstChild!.textContent)).toEqual(["Game and buttons", "Game only", "Buttons only", "Off"]);
    expect(shown().querySelectorAll(".nj-tag")).toHaveLength(2);
    expect(shown().querySelector<HTMLInputElement>('input[value="buttons"]')!.checked).toBe(true);
    const strength = input("Button vibration strength");
    for (const v of [60, 70, 80]) {
      strength.value = String(v);
      strength.dispatchEvent(new Event("input"));
    }
    expect(platform.calls.vibrate).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 160));
    strength.value = "90";
    strength.dispatchEvent(new Event("input"));
    expect(platform.calls.vibrate).toHaveLength(2);
    pick(overlay(), "nj-vibration", "game");
    expect(controller.settings.vibration).toBe("game");
    expect(strength.disabled).toBe(true);
    pick(overlay(), "nj-vibration", "all");
    expect(strength.disabled).toBe(false);
  });
});
