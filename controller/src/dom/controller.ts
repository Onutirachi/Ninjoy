import type { Binding, ResolvedSkin } from "@ninjoy/skin-format";
import { autoSize, type LayoutEdit } from "../engine/layout.ts";
import { clampSettings, settingsFromStorage, type PlayerSettings } from "../engine/settings.ts";
import { StateBuilder, type ControllerState, type DS4Button } from "../engine/state.ts";
import { createStore } from "../platform/storage.ts";
import { createAppearance } from "./appearance.ts";
import { HitTester } from "./hit-test.ts";
import { attachInput, type Finger } from "./input.ts";
import { render, type RenderedControl } from "./renderer.ts";

export interface Platform {
  vibrate(ms: number): void;
  now(): number;
}

export interface ControllerOptions {
  skin: ResolvedSkin;
  /** element the controller fills */
  root: HTMLElement;
  /** defaults to localStorage; null keeps everything in memory */
  storage?: Storage | null;
  platform?: Partial<Platform>;
}

export interface Controller {
  readonly state: ControllerState;
  subscribe(listener: (state: ControllerState) => void): () => void;
  readonly settings: PlayerSettings;
  updateSettings(patch: Partial<PlayerSettings>): void;
  setEditMode(on: boolean): void;
  resetLayout(): void;
  releaseAll(): void;
  /** re-measure after resize/orientation change (also automatic) */
  relayout(): void;
  dispose(): void;
}

const defaultPlatform: Platform = {
  vibrate: (ms) => navigator.vibrate?.(ms),
  now: () => performance.now(),
};

/** Skin bindings → DS4 buttons. The touchpad click buttons also add a touch (see US4). */
const BUTTON_OF: Record<Binding, DS4Button> = {
  cross: "cross", circle: "circle", square: "square", triangle: "triangle",
  up: "up", down: "down", left: "left", right: "right",
  l1: "l1", r1: "r1", l2: "l2", r2: "r2", l3: "l3", r3: "r3",
  share: "share", options: "options", ps: "ps",
  touchpad: "touchpad", "touchpad-left": "touchpad", "touchpad-right": "touchpad",
};

export function createController(options: ControllerOptions): Controller {
  const { skin, root } = options;
  const platform: Platform = { ...defaultPlatform, ...options.platform };
  const store = createStore(options.storage === undefined ? globalThis.localStorage ?? null : options.storage);
  let settings = settingsFromStorage(store.loadSettings());
  let edits: Record<string, LayoutEdit> = store.loadLayout(skin.meta);

  const rendered = render(skin, root);
  const hitTester = new HitTester();
  const looks = new Map(rendered.controls.map((rc) => [rc, createAppearance(rc)]));
  const active = new Set<RenderedControl>();
  const builder = new StateBuilder();
  builder.setGyro(settings.gyro);
  let state = builder.publish(platform.now());
  const listeners = new Set<(state: ControllerState) => void>();

  const update = (vibrateFor?: Finger) => {
    builder.reset();
    const touched = new Set<RenderedControl>();
    for (const finger of input.fingers.values()) {
      for (const rc of rendered.controls) {
        if (hitTester.hits(rc, finger.x, finger.y, settings.finger)) touched.add(rc);
      }
    }
    for (const rc of touched) {
      const { control } = rc;
      if (control.type === "button") for (const b of control.bindings ?? []) builder.press(BUTTON_OF[b]);
      else if (control.type === "trigger" && control.trigger) builder.trigger(control.trigger.which, 1);
    }

    let activated = false;
    for (const rc of rendered.controls) {
      const isActive = touched.has(rc);
      if (isActive && !active.has(rc)) activated = true;
      if (isActive) active.add(rc);
      else active.delete(rc);
      looks.get(rc)!.apply({ active: isActive, on: null });
    }
    if (activated && vibrateFor?.pointerType === "touch") platform.vibrate(12);

    const next = builder.publish(platform.now());
    if (next !== state) {
      state = next;
      for (const listener of listeners) listener(state);
    }
  };

  const input = attachInput(rendered.stage, {
    down: (finger) => update(finger),
    move: (finger) => update(finger),
    up: () => update(),
  }, platform.now);

  const relayout = () => {
    const size = settings.size === "auto" ? autoSize(root.getBoundingClientRect().height) : settings.size;
    rendered.relayout({ size, height: settings.height, edits });
    hitTester.invalidate();
    update();
  };
  const resizeObserver = new ResizeObserver(() => relayout());
  resizeObserver.observe(root);
  relayout();

  return {
    get state() { return state; },
    get settings() { return settings; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateSettings(patch) {
      settings = clampSettings({ ...settings, ...patch });
      store.saveSettings(settings);
      builder.setGyro(settings.gyro);
      relayout();
    },
    setEditMode(on) {
      input.setEnabled(!on);
    },
    resetLayout() {
      edits = {};
      store.saveLayout(skin.meta, edits);
      relayout();
    },
    releaseAll: () => input.releaseAll(),
    relayout,
    dispose() {
      resizeObserver.disconnect();
      input.dispose();
      rendered.dispose();
      listeners.clear();
    },
  };
}
