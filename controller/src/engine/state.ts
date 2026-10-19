/** The DualShock 4 buttons, in report order. "touchpad" is the touchpad click. */
export const DS4_BUTTONS = [
  "cross", "circle", "square", "triangle",
  "up", "down", "left", "right",
  "l1", "r1", "l2", "r2", "l3", "r3",
  "share", "options", "ps", "touchpad",
] as const;

export type DS4Button = (typeof DS4_BUTTONS)[number];

export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }
export interface Touch { id: number; x: number; y: number }
export interface Motion { rate: Vec3; accel: Vec3; time: number }

export interface ControllerState {
  /** increments on every change */
  readonly seq: number;
  /** performance.now() of the change */
  readonly time: number;
  readonly buttons: ReadonlySet<DS4Button>;
  /** −1…1; y positive = down */
  readonly sticks: { readonly left: Vec2; readonly right: Vec2 };
  /** 0…1 */
  readonly triggers: { readonly l2: number; readonly r2: number };
  /** up to 2 most recent touches, normalized over the whole DS4 touchpad */
  readonly touchpad: { readonly touches: readonly Touch[] };
  readonly gyro: boolean;
  /** controller frame: x right, y up, z toward the player */
  readonly motion: Motion | null;
}

/**
 * Collects the inputs of one update and publishes an immutable state. Buttons are OR-ed,
 * trigger forces max-ed; publish() returns the previous object when nothing changed.
 */
export class StateBuilder {
  private buttons = new Set<DS4Button>();
  private sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  private triggers = { l2: 0, r2: 0 };
  private touches: Touch[] = [];
  private gyro = false;
  private motion: Motion | null = null;
  private last: ControllerState | null = null;
  private seq = 0;

  /** Clears the finger-driven inputs; gyro and motion persist until changed. */
  reset(): void {
    this.buttons = new Set();
    this.sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
    this.triggers = { l2: 0, r2: 0 };
    this.touches = [];
  }

  press(button: DS4Button): void {
    this.buttons.add(button);
    if (button === "l2" || button === "r2") this.triggers[button] = 1;
  }

  stick(side: "left" | "right", x: number, y: number): void {
    this.sticks[side] = { x, y };
  }

  trigger(which: "l2" | "r2", force: number): void {
    this.triggers[which] = Math.max(this.triggers[which], force);
  }

  setTouches(touches: Touch[]): void {
    this.touches = touches;
  }

  setGyro(on: boolean): void {
    this.gyro = on;
    if (!on) this.motion = null;
  }

  setMotion(motion: Motion | null): void {
    this.motion = this.gyro ? motion : null;
  }

  publish(time: number): ControllerState {
    const buttons = new Set(this.buttons);
    for (const t of ["l2", "r2"] as const) if (this.triggers[t] > 0) buttons.add(t);
    const ordered = new Set(DS4_BUTTONS.filter((b) => buttons.has(b)));
    if (this.last && same(this.last, ordered, this)) return this.last;
    this.last = Object.freeze({
      seq: ++this.seq,
      time,
      buttons: ordered,
      sticks: { left: { ...this.sticks.left }, right: { ...this.sticks.right } },
      triggers: { ...this.triggers },
      touchpad: { touches: this.touches.map((t) => ({ ...t })) },
      gyro: this.gyro,
      motion: this.motion,
    });
    return this.last;
  }
}

function same(prev: ControllerState, buttons: Set<DS4Button>, next: StateBuilder): boolean {
  const n = next as unknown as { sticks: ControllerState["sticks"]; triggers: ControllerState["triggers"]; touches: Touch[]; gyro: boolean; motion: Motion | null };
  if (prev.buttons.size !== buttons.size || [...buttons].some((b) => !prev.buttons.has(b))) return false;
  if (prev.gyro !== n.gyro || prev.motion !== n.motion) return false;
  if (prev.triggers.l2 !== n.triggers.l2 || prev.triggers.r2 !== n.triggers.r2) return false;
  for (const s of ["left", "right"] as const) {
    if (prev.sticks[s].x !== n.sticks[s].x || prev.sticks[s].y !== n.sticks[s].y) return false;
  }
  const a = prev.touchpad.touches, b = n.touches;
  return a.length === b.length && a.every((t, i) => t.id === b[i]!.id && t.x === b[i]!.x && t.y === b[i]!.y);
}
