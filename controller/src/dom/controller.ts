import type { Binding, ResolvedSkin } from "@ninjoy/skin-format";
import { EntryOrder, StickFingers } from "../engine/fingers.ts";
import { autoSize, type LayoutEdit } from "../engine/layout.ts";
import { toControllerFrame } from "../engine/motion.ts";
import { clampSettings, settingsFromStorage, stickZones, triggerZones, type ControlOverride, type PlayerSettings } from "../engine/settings.ts";
import { StateBuilder, type ControllerState, type DS4Button, type Touch } from "../engine/state.ts";
import { stickValue } from "../engine/stick.ts";
import { CLICK_POINT, MAX_TOUCHES, touchpadPoint } from "../engine/touchpad.ts";
import { triggerForce } from "../engine/zones.ts";
import { browserFullscreen, type FullscreenAdapter } from "../platform/fullscreen.ts";
import { browserMotion, type MotionAdapter } from "../platform/motion.ts";
import { createStore } from "../platform/storage.ts";
import { browserVibration, type VibrationAdapter } from "../platform/vibration.ts";
import { createAppearance } from "./appearance.ts";
import { HitTester } from "./hit-test.ts";
import { attachInput, type Finger } from "./input.ts";
import { render, type RenderedControl } from "./renderer.ts";
import { createThumb } from "./thumb.ts";
import { createTriggerFill } from "./trigger-fill.ts";

export interface Platform {
  now(): number;
  vibration: VibrationAdapter;
  fullscreen: FullscreenAdapter;
  motion: MotionAdapter;
}

/** Things the page explains when the device cannot do them. */
export type NoticeKey = "noFullscreen" | "noVibration" | "motionDenied" | "noMotion" | "motionInsecure";

export interface ControllerOptions {
  skin: ResolvedSkin;
  /** element the controller fills */
  root: HTMLElement;
  /** defaults to localStorage; null keeps everything in memory */
  storage?: Storage | null;
  /** vibration/fullscreen/motion adapters (tests stub them) */
  platform?: Partial<Platform>;
  /** the skin's menu control was tapped */
  onMenu?: () => void;
  onNotice?: (key: NoticeKey) => void;
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
  now: () => performance.now(),
  vibration: browserVibration,
  fullscreen: browserFullscreen,
  motion: browserMotion,
};

/** Skin bindings → DS4 buttons. The touchpad click buttons also add a touch. */
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
  const notify = (key: NoticeKey) => options.onNotice?.(key);
  const store = createStore(options.storage === undefined ? globalThis.localStorage ?? null : options.storage);
  let settings = settingsFromStorage(store.loadSettings());
  let edits: Record<string, LayoutEdit> = store.loadLayout(skin.meta);
  const overrides: Record<string, ControlOverride> = store.loadOverrides(skin.meta);

  const rendered = render(skin, root);
  const hitTester = new HitTester();
  const looks = new Map(rendered.controls.map((rc) => [rc, createAppearance(rc)]));
  const active = new Set<RenderedControl>();
  const ofType = (type: string) => rendered.controls.filter((rc) => rc.control.type === type);

  const sticks = ofType("stick");
  const thumbs = new Map(sticks.map((rc) => [rc, createThumb(rc)]));
  /** thumb at rest relative to the stick's touch area, measured once per layout */
  const thumbRest = new Map<RenderedControl, ReturnType<ReturnType<typeof createThumb>["measure"]>>();
  const stickFingers = new StickFingers();

  const triggers = ofType("trigger");
  const triggerOrder = new Map(triggers.map((rc) => [rc, new EntryOrder<number>()]));
  const fills = new Map(triggers.filter((rc) => rc.control.trigger?.showFill).map((rc) => [rc, createTriggerFill(rc)]));

  const touchpads = ofType("touchpad");
  const touchOrder = new EntryOrder<number>();
  const systems = ofType("system");

  const builder = new StateBuilder();
  let state = builder.publish(platform.now());
  const listeners = new Set<(state: ControllerState) => void>();

  const publish = (now: number) => {
    const next = builder.publish(now);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener(state);
  };

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
    updateTouchpad(touched);

    let activated = false;
    for (const rc of rendered.controls) {
      const isActive = touched.has(rc);
      if (isActive && !active.has(rc)) activated = true;
      if (isActive) active.add(rc);
      else active.delete(rc);
      looks.get(rc)!.apply({ active: isActive, on: toggleState(rc) });
    }
    if (activated && vibrateFor?.pointerType === "touch") {
      if (platform.vibration.supported()) platform.vibration.vibrate(12);
      else notify("noVibration");
    }
    publish(now);
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

  /** The 2 most recent fingers on touchpad areas; click buttons touch their half when the touchpad is free. */
  const updateTouchpad = (touched: Map<RenderedControl, Finger[]>) => {
    const points = new Map<number, Touch>();
    for (const rc of touchpads) {
      const box = hitTester.box(rc);
      for (const finger of touched.get(rc) ?? []) {
        if (points.has(finger.id)) continue;
        const local = { x: (finger.x - box.left) / box.width, y: (finger.y - box.top) / box.height };
        points.set(finger.id, { id: finger.id, ...touchpadPoint(local, rc.control.area ?? "full") });
      }
    }
    touchOrder.track(points.keys());
    const touches = touchOrder.recent(MAX_TOUCHES).map((id) => points.get(id)!);
    if (!touches.length) {
      for (const [rc, fingers] of touched) {
        for (const side of ["left", "right"] as const) {
          if (rc.control.type === "button" && rc.control.bindings?.includes(`touchpad-${side}`)) touches.push({ id: fingers[0]!.id, ...CLICK_POINT[side] });
        }
      }
    }
    builder.setTouches(touches.slice(0, MAX_TOUCHES));
  };

  const toggleState = (rc: RenderedControl): boolean | null => {
    if (rc.control.action === "gyro") return state.gyro;
    if (rc.control.action === "fullscreen") return platform.fullscreen.active();
    return null;
  };

  // ---------- system controls (on release: browsers only allow fullscreen after a completed tap) ----------

  let stopMotion: (() => void) | null = null;
  const setGyro = (on: boolean) => {
    stopMotion?.();
    stopMotion = null;
    builder.setGyro(on);
    if (on) {
      stopMotion = platform.motion.listen((sample) => {
        const frame = toControllerFrame(sample.rate, sample.accel, platform.motion.angle());
        builder.setMotion({ ...frame, time: sample.time });
        publish(platform.now());
      });
    }
    publish(platform.now());
    update();
  };

  /** Gyro on/off from a tap (system control or menu). Turning on may ask for permission. */
  const toggleGyro = (on: boolean) => {
    const save = (value: boolean) => {
      settings = { ...settings, gyro: value };
      store.saveSettings(settings);
    };
    if (!on) {
      save(false);
      setGyro(false);
      return;
    }
    const support = platform.motion.support();
    if (support !== "available") {
      notify(support === "insecure" ? "motionInsecure" : "noMotion");
      return;
    }
    void platform.motion.requestPermission().then((granted) => {
      if (!granted) {
        notify("motionDenied");
        return;
      }
      save(true);
      setGyro(true);
    });
  };

  const runSystem = (finger: Finger) => {
    for (const rc of systems) {
      if (!hitTester.hits(rc, finger.x, finger.y, settings.finger)) continue;
      const action = rc.control.action;
      if (action === "menu") {
        input.releaseAll();
        options.onMenu?.();
      } else if (action === "fullscreen") {
        if (platform.fullscreen.supported()) platform.fullscreen.toggle(document.documentElement);
        else notify("noFullscreen");
      } else if (action === "gyro") {
        toggleGyro(!state.gyro);
      }
    }
  };

  const input = attachInput(rendered.stage, {
    down: (finger) => update(finger),
    move: (finger) => update(finger),
    up: (finger, completed) => {
      stickFingers.release(finger.id, platform.now());
      update();
      if (completed) runSystem(finger);
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
  const stopFullscreen = platform.fullscreen.onChange(() => update());
  relayout();
  // without a tap there is no permission prompt: start listening where the browser allows it
  setGyro(settings.gyro && platform.motion.support() === "available");

  return {
    get state() { return state; },
    get settings() { return settings; },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateSettings(patch) {
      const { gyro, ...rest } = patch;
      settings = clampSettings({ ...settings, ...rest });
      store.saveSettings(settings);
      relayout();
      if (gyro !== undefined && gyro !== state.gyro) toggleGyro(gyro);
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
      stopFullscreen();
      stopMotion?.();
      for (const thumb of thumbs.values()) thumb.dispose();
      input.dispose();
      rendered.dispose();
      listeners.clear();
    },
  };
}
