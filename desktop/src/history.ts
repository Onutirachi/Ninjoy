/**
 * The input history, like a fighting game's training mode: every press (a button, a d-pad
 * direction, a stick pushed one way) fades in on the right, big; older ones slide left, smaller
 * and fainter, centered on one line. Under each, how many frames (60 per second) it was held; a press still held stays lit
 * and keeps counting.
 */

import type { LiveView } from "./bridge.ts";
import { el } from "./dom.ts";
import { HISTORY_ICONS } from "./history-icons.ts";

/** DualShock 4 button bits, in the session's order (see pad.ts). */
const BITS = ["cross", "circle", "square", "triangle", "up", "down", "left", "right", "l1", "r1", "l2", "r2", "l3", "r3", "share", "options", "ps", "touchpad"];

const ITEMS = 12;
const FRAME_MS = 1000 / 60;
/** a stick counts as pushed past this much of its travel */
const STICK_PUSH = 0.5;
/** a button icon's height in drawing units (stick icons are taller) */
const BUTTON_HEIGHT = 1.61;

/** A stick's direction (4 ways, the stronger axis), or null near the center. */
function stickDirection(x: number, y: number): string | null {
  if (Math.hypot(x, y) < STICK_PUSH) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
}

/** Everything held now, by icon name: buttons, d-pad directions and stick directions. */
export function heldInputs(s: LiveView): Set<string> {
  const held = new Set(BITS.filter((_, bit) => (s.buttons & (1 << bit)) !== 0));
  const left = stickDirection(s.sticks[0] / 32767, s.sticks[1] / 32767);
  const right = stickDirection(s.sticks[2] / 32767, s.sticks[3] / 32767);
  if (left) held.add(`ls-${left}`);
  if (right) held.add(`rs-${right}`);
  return held;
}

interface Item {
  name: string;
  start: number;
  /** released at; null while held */
  end: number | null;
  el: HTMLElement;
  frames: HTMLElement;
}

export function createHistory() {
  const strip = el("div", { className: "history" });
  const items: Item[] = []; // newest first
  let held = new Set<string>();

  const frames = (item: Item, now: number) => {
    const n = Math.max(1, Math.round(((item.end ?? now) - item.start) / FRAME_MS));
    return n > 99 ? "99+" : String(n);
  };

  /** older presses move left, smaller and fainter; the held ones stay lit and keep counting */
  const place = (now: number) => {
    items.forEach((item, k) => {
      item.el.style.setProperty("--s", String(Math.max(0.5, 1 - k * 0.06)));
      item.el.style.opacity = String(Math.max(0.15, 1 - k * 0.08));
      item.el.classList.toggle("held", item.end === null);
      const count = frames(item, now);
      if (item.frames.textContent !== count) item.frames.textContent = count;
    });
  };

  return {
    el: strip,
    update(s: LiveView | null, now: number) {
      const next = s ? heldInputs(s) : new Set<string>();
      for (const item of items) if (item.end === null && !next.has(item.name)) item.end = now;
      const added = [...next].filter((name) => !held.has(name));
      // where the shown presses are now, to slide them to their new places
      const before = added.length ? new Map(items.map((i) => [i, i.el.getBoundingClientRect().left])) : null;
      for (const name of added) {
        // a new press fades in on the right, pushing the others left
        const icon = el("span", { className: "icon" });
        icon.innerHTML = HISTORY_ICONS[name] ?? name;
        const box = icon.querySelector("svg")?.viewBox.baseVal;
        const label = el("small");
        const item = el("span", { className: `in in-${name}` }, [icon, label]);
        // icons keep their drawn size: sticks are taller than buttons
        if (box) {
          item.style.setProperty("--u", String(box.height / BUTTON_HEIGHT));
          item.style.setProperty("--w", String(box.width / BUTTON_HEIGHT));
        }
        strip.append(item);
        items.unshift({ name, start: now, end: null, el: item, frames: label });
        if (items.length > ITEMS) items.pop()!.el.remove();
      }
      held = next;
      place(now);
      if (before) {
        for (const [item, left] of before) {
          const dx = left - item.el.getBoundingClientRect().left;
          if (dx && item.el.isConnected) item.el.animate?.([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 160, easing: "ease-out" });
        }
      }
    },
  };
}
