/** A tap shorter than this arms the double-tap… */
export const TAP_MAX_MS = 250;
/** …and a new touch within this window after it clicks the stick. */
export const DOUBLE_TAP_MS = 300;

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
