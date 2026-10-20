/** A tap shorter than this arms the double-tap… */
export const TAP_MAX_MS = 250;
/** …and a new touch within this window after it clicks the stick. */
export const DOUBLE_TAP_MS = 300;
/** A touchpad tap moves less than this (CSS px), so a quick flick is not a tap… */
export const TAP_SLOP_PX = 12;
/** …and the second touch starts within this distance of the tap (CSS px). */
export const DOUBLE_TAP_REACH_PX = 60;

interface Grab { stick: string; at: number; click: boolean }

/**
 * Which finger drives which stick. A stick grabs a finger on first touch and keeps it until
 * release, even outside the stick; the newest finger wins and the previous takes over when it
 * leaves. Double-tap and hold sends the stick click.
 */
export class StickFingers {
  private grabs = new Map<number, Grab>();
  private lastTapUp = new Map<string, number>();

  /** Stick holding this finger, if any. */
  stickOf(finger: number): string | undefined {
    return this.grabs.get(finger)?.stick;
  }

  grab(stick: string, finger: number, now: number): void {
    if (this.grabs.has(finger)) return;
    const tapUp = this.lastTapUp.get(stick);
    this.grabs.set(finger, { stick, at: now, click: tapUp !== undefined && now - tapUp <= DOUBLE_TAP_MS });
  }

  release(finger: number, now: number): void {
    const grab = this.grabs.get(finger);
    if (!grab) return;
    this.grabs.delete(finger);
    if (!grab.click && now - grab.at < TAP_MAX_MS) this.lastTapUp.set(grab.stick, now);
    else this.lastTapUp.delete(grab.stick);
  }

  /** The finger driving the stick: the newest one holding it. */
  owner(stick: string): number | undefined {
    let best: number | undefined;
    let at = -Infinity;
    for (const [finger, grab] of this.grabs) {
      if (grab.stick === stick && grab.at >= at) {
        best = finger;
        at = grab.at;
      }
    }
    return best;
  }

  clicking(stick: string): boolean {
    for (const grab of this.grabs.values()) if (grab.stick === stick && grab.click) return true;
    return false;
  }
}

/**
 * Keys in the order they appeared. `track` drops keys that are gone and appends new ones, so
 * the last key is the most recent still present (last finger entered wins, recent touches).
 */
export class EntryOrder<K> {
  private order: K[] = [];

  track(present: Iterable<K>): void {
    const now = new Set(present);
    this.order = this.order.filter((k) => now.has(k));
    for (const k of now) if (!this.order.includes(k)) this.order.push(k);
  }

  last(): K | undefined {
    return this.order.at(-1);
  }

  /** the n most recent, oldest first */
  recent(n: number): K[] {
    return this.order.slice(-n);
  }
}

/**
 * Double tap and hold on an area (a touchpad half) presses a click while that finger stays down,
 * like a laptop touchpad: a tap shorter than TAP_MAX_MS that moves less than TAP_SLOP_PX, then a
 * new touch on the same area within DOUBLE_TAP_MS and DOUBLE_TAP_REACH_PX of the tap. Quick
 * flicks (moving the cursor) never arm it. Leaving the touchpad lets go of the click, like a
 * finger that can't stay pressed off a real touchpad; that finger still belongs to the touchpad.
 */
export class TapClick<Area> {
  private touches = new Map<number, { area: Area; at: number; x: number; y: number; moved: number; click: boolean; captured: boolean }>();
  private lastTap = new Map<Area, { at: number; x: number; y: number }>();

  /** A finger is on `area` at (x, y) in CSS px; call on every update (only its first area counts). */
  touch(finger: number, area: Area, now: number, x: number, y: number): void {
    const own = this.touches.get(finger);
    if (own) {
      own.moved = Math.max(own.moved, Math.hypot(x - own.x, y - own.y));
      return;
    }
    const tap = this.lastTap.get(area);
    const click = tap !== undefined && now - tap.at <= DOUBLE_TAP_MS && Math.hypot(x - tap.x, y - tap.y) <= DOUBLE_TAP_REACH_PX;
    this.touches.set(finger, { area, at: now, x, y, moved: 0, click, captured: click });
  }

  /** Fingers on a touchpad in this update: a clicking finger missing from them lets go. */
  onTouchpad(fingers: Set<number>): void {
    for (const [finger, touch] of this.touches) if (!fingers.has(finger)) touch.click = false;
  }

  release(finger: number, now: number): void {
    const touch = this.touches.get(finger);
    if (!touch) return;
    this.touches.delete(finger);
    if (!touch.captured && now - touch.at < TAP_MAX_MS && touch.moved < TAP_SLOP_PX) this.lastTap.set(touch.area, { at: now, x: touch.x, y: touch.y });
    else this.lastTap.delete(touch.area);
  }

  /** True for a double-tapping finger: it belongs to the touchpad until released. */
  holds(finger: number): boolean {
    return this.touches.get(finger)?.captured === true;
  }

  /** True while a double-tapping finger is down. */
  get clicking(): boolean {
    for (const t of this.touches.values()) if (t.click) return true;
    return false;
  }
}
