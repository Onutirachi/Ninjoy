import { afterEach, describe, expect, it } from "vitest";
import { createController, type Controller } from "../../src/dom/controller.ts";
import { createI18n, type I18n } from "../../src/i18n/index.ts";
import { loadOfficialSkin } from "../../src/skins.ts";
import { createEditToolbar } from "../../src/ui/edit-mode.ts";
import { createMenu } from "../../src/ui/menu.ts";
import { at, mount, pressed, stubPlatform, touch } from "./helpers.ts";

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

/** Sets a range input by its label text and fires `input`. */
function setSlider(scope: HTMLElement, label: string, value: number) {
  const row = [...scope.querySelectorAll<HTMLElement>(".nj-row")].find((r) => r.querySelector("span")?.textContent === label);
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
    setSlider(panel(), "Trigger 100% zone (top)", 50);
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
    const select = panel().querySelector("select")!;
    select.value = "en";
    select.dispatchEvent(new Event("change"));
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
    setSlider(panel(), "Stick dead zone (center)", 20);
    setSlider(panel(), "Stick 100% zone (edge)", 10);
    setSlider(panel(), "Trigger minimum force", 15);
    setSlider(panel(), "Trigger 100% zone (top)", 30);
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
