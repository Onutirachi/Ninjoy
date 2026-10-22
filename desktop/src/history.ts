/**
 * The input history, like a fighting game's training mode: every press (a button, a d-pad
 * direction, a stick pushed one way) enters on the right, big; older ones move left, smaller and
 * fainter, and fade out after a few seconds. A press still held stays lit.
 */

import type { LiveView } from "./bridge.ts";
import { el } from "./dom.ts";
import { HISTORY_ICONS } from "./history-icons.ts";

/** DualShock 4 button bits, in the session's order (see pad.ts). */
const BITS = ["cross", "circle", "square", "triangle", "up", "down", "left", "right", "l1", "r1", "l2", "r2", "l3", "r3", "share", "options", "ps", "touchpad"];

const ITEMS = 12;
/** a stick counts as pushed past this much of its travel */
const STICK_PUSH = 0.5;
/** how long a press stays before fading out, and the fade */
const STAY_MS = 4000;
const FADE_MS = 1000;

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
  at: number;
  el: HTMLElement;
}

export function createHistory() {
  const strip = el("div", { className: "history" });
  const items: Item[] = []; // newest first
  let held = new Set<string>();

  /** size and opacity by age (position) and time */
  const place = (now: number) => {
    items.forEach((item, k) => {
      const lit = held.has(item.name) && k === items.findIndex((i) => i.name === item.name);
      // a held press stays; the time counts from its release
      const age = lit ? 0 : now - item.at;
      const fade = age < STAY_MS ? 1 : Math.max(0, 1 - (age - STAY_MS) / FADE_MS);
      item.el.style.setProperty("--s", String(Math.max(0.45, 1 - k * 0.07)));
      item.el.style.opacity = String(Math.max(0, 1 - k * 0.08) * fade);
      item.el.classList.toggle("held", lit);
    });
    // gone from view: drop them
    while (items.length && Number(items.at(-1)!.el.style.opacity) === 0) items.pop()!.el.remove();
  };

  return {
    el: strip,
    update(s: LiveView | null, now: number) {
      const next = s ? heldInputs(s) : new Set<string>();
      for (const name of next) {
        if (held.has(name)) continue;
        // a new press enters on the right
        const item = el("span", { className: `in in-${name}` });
        item.innerHTML = HISTORY_ICONS[name] ?? name;
        // icons keep their drawn size: sticks are taller than buttons
        const svg = item.querySelector("svg");
        if (svg) item.style.setProperty("--u", String(svg.viewBox.baseVal.height / 1.61));
        strip.append(item);
        items.unshift({ name, at: now, el: item });
        if (items.length > ITEMS) items.pop()!.el.remove();
      }
      for (const name of held) {
        if (!next.has(name)) {
          const item = items.find((i) => i.name === name);
          if (item) item.at = now; // released: start its time
        }
      }
      held = next;
      place(now);
    },
  };
}
