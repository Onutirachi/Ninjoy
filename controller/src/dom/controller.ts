import type { Binding, ResolvedSkin } from "@ninjoy/skin-format";
import { autoSize, type LayoutEdit } from "../engine/layout.ts";
import { EntryOrder, StickFingers } from "../engine/fingers.ts";
import { clampSettings, settingsFromStorage, stickZones, triggerZones, type ControlOverride, type PlayerSettings } from "../engine/settings.ts";
import { stickValue } from "../engine/stick.ts";
import { triggerForce } from "../engine/zones.ts";
import { StateBuilder, type ControllerState, type DS4Button } from "../engine/state.ts";
import { createStore } from "../platform/storage.ts";
import { createAppearance } from "./appearance.ts";
import { HitTester } from "./hit-test.ts";
import { createThumb } from "./thumb.ts";
import { createTriggerFill } from "./trigger-fill.ts";
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
  const overrides: Record<string, ControlOverride> = store.loadOverrides(skin.meta);

  const rendered = render(skin, root);
  const hitTester = new HitTester();
  const looks = new Map(rendered.controls.map((rc) => [rc, createAppearance(rc)]));
  const active = new Set<RenderedControl>();
  const sticks = rendered.controls.filter((rc) => rc.control.type === "stick");
  const thumbs = new Map(sticks.map((rc) => [rc, createThumb(rc)]));
  /** thumb at rest relative to the stick's touch area, measured once per layout */
  const thumbRest = new Map<RenderedControl, ReturnType<ReturnType<typeof createThumb>["measure"]>>();
  const stickFingers = new StickFingers();
  const triggers = rendered.controls.filter((rc) => rc.control.type === "trigger");
  const triggerOrder = new Map(triggers.map((rc) => [rc, new EntryOrder<number>()]));
  const fills = new Map(triggers.filter((rc) => rc.control.trigger?.showFill).map((rc) => [rc, createTriggerFill(rc)]));
  const builder = new StateBuilder();
  builder.setGyro(settings.gyro);
  let state = builder.publish(platform.now());
  const listeners = new Set<(state: ControllerState) => void>();

  const update = (vibrateFor?: Finger) => {
    builder.reset();
    const now = platform.now();
    /** control → fingers touching it */
    const touched = new Map<RenderedControl, Finger[]>();
    for (const finger of input.fingers.values()) {
      // a stick grabs the finger as soon as it touches it, and keeps it until release
      if (stickFingers.stickOf(finger.id) === undefined) {
        const stick = sticks.find((rc) => hitTester.hits(rc, finger.x, finger.y, settings.finger));
        if (stick) stickFingers.grab(stick.control.id, finger.id, now);
      }
      for (const rc of rendered.controls) {
        if (rc.control.type !== "stick" && hitTester.hits(rc, finger.x, finger.y, settings.finger)) {
          touched.set(rc, [...(touched.get(rc) ?? []), finger]);
        }
      }
    }
    for (const rc of sticks) if (updateStick(rc)) touched.set(rc, []);
    for (const rc of triggers) updateTrigger(rc, touched.get(rc) ?? []);
    for (const rc of touched.keys()) {
      const { control } = rc;
      if (control.type === "button") for (const b of control.bindings ?? []) builder.press(BUTTON_OF[b]);
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

    const next = builder.publish(now);
    if (next !== state) {
      state = next;
      for (const listener of listeners) listener(state);
    }
  };

  /** Stick value, click and thumb from the finger driving it; true while it is held. */
  const updateStick = (rc: RenderedControl): boolean => {
    const { control } = rc;
    const thumb = thumbs.get(rc)!;
    const finger = input.fingers.get(stickFingers.owner(control.id) ?? -1);
    if (!finger) {
      thumb.moveTo(0, 0, false);
      return false;
    }
    const area = hitTester.box(rc);
    let rest = thumbRest.get(rc);
    if (!rest) thumbRest.set(rc, (rest = thumb.measure(area)));
    // the thumb's center travels inside the ellipse inscribed in the touch area minus the thumb
    const travel = { x: Math.max(1, (area.width / 2) * (1 - rest.size.x)), y: Math.max(1, (area.height / 2) * (1 - rest.size.y)) };
    const cx = area.left + area.width / 2, cy = area.top + area.height / 2;
    const value = stickValue({ x: finger.x - cx, y: finger.y - cy }, travel, stickZones(control, settings, overrides[control.id]));
    builder.stick(control.side ?? "left", value.x, value.y);
    const click = control.stick?.click;
    if (click && click !== "none" && stickFingers.clicking(control.id)) builder.press(BUTTON_OF[click]);
    thumb.moveTo(value.clamped.x - rest.offset.x * area.width, value.clamped.y - rest.offset.y * area.height, true);
    return true;
  };

  /** Force from the last finger that entered the trigger, along its direction in the touch-area box. */
  const updateTrigger = (rc: RenderedControl, fingers: Finger[]) => {
    const { control } = rc;
    const order = triggerOrder.get(rc)!;
    order.track(fingers.map((f) => f.id));
    const finger = fingers.find((f) => f.id === order.last());
    if (!finger || !control.trigger) {
      fills.get(rc)?.update(0, 0, 0, false);
      return;
    }
    const r = hitTester.box(rc);
    const along = { up: (r.bottom - finger.y) / r.height, down: (finger.y - r.top) / r.height, left: (r.right - finger.x) / r.width, right: (finger.x - r.left) / r.width };
    const raw = Math.min(1, Math.max(0, along[control.trigger.direction]));
    const zones = triggerZones(control, settings, overrides[control.id]);
    const force = triggerForce(raw, zones.maxZone, zones.minForce);
    builder.trigger(control.trigger.which, force);
    fills.get(rc)?.update(raw, force, zones.maxZone, true);
  };

  const input = attachInput(rendered.stage, {
    down: (finger) => update(finger),
    move: (finger) => update(finger),
    up: (finger) => {
      stickFingers.release(finger.id, platform.now());
      update();
    },
  }, platform.now);

  const relayout = () => {
    const size = settings.size === "auto" ? autoSize(root.getBoundingClientRect().height) : settings.size;
    rendered.relayout({ size, height: settings.height, edits });
    hitTester.invalidate();
    thumbRest.clear();
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
      for (const thumb of thumbs.values()) thumb.dispose();
      input.dispose();
      rendered.dispose();
      listeners.clear();
    },
  };
}
