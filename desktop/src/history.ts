/**
 * The input history, like a fighting game's training mode (after the maintainer's prototype,
 * drafts/animationhistory): every press (a button, a d-pad direction, a stick pushed one way)
 * fades in on the right; older ones move left, smaller around their centers (a cone) and fainter,
 * until the tenth fades out. Under each, how many frames (60 per second) it was held; a press still
 * held stays lit and keeps counting.
 */

import type { LiveView } from "./bridge.ts";
import { el } from "./dom.ts";
import { HISTORY_ICONS } from "./history-icons.ts";

/** DualShock 4 button bits, in the session's order (see pad.ts). */
const BITS = ["cross", "circle", "square", "triangle", "up", "down", "left", "right", "l1", "r1", "l2", "r2", "l3", "r3", "share", "options", "ps", "touchpad"];

const ITEMS = 10;
/** the oldest press's size */
const MIN_SCALE = 0.5;
/** the gap after the newest press, as a share of the strip's width (smaller ones get less) */
const GAP = 0.016;
/** how far a new press starts to the right, as a share of the strip's width */
const ENTER = 0.025;
const LEAVE_MS = 300;
const FRAME_MS = 1000 / 60;
/** a stick counts as pushed past this much of its travel */
const STICK_PUSH = 0.5;

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

  /** newest on the right; each older one left of it, smaller around its center and fainter */
  const place = () => {
    const width = strip.clientWidth;
    let offset = 0;
    items.forEach((item, k) => {
      const scale = 1 - (k / (ITEMS - 1)) * (1 - MIN_SCALE);
      const w = item.el.offsetWidth;
      // it shrinks around its center: move it right by what it loses on that side, so the gap
      // to the newer one stays even whatever the icons' widths
      item.el.style.transform = `translateX(${-offset + (w * (1 - scale)) / 2}px) scale(${scale})`;
      item.el.style.opacity = String(Math.max(0, 1 - k / (ITEMS - 1)));
      offset += (w + GAP * width) * scale;
    });
  };

  // places are in pixels: a resized or maximized window places everything again, at once
  let lastWidth = 0;
  new ResizeObserver(() => {
    if (strip.clientWidth === lastWidth) return;
    lastWidth = strip.clientWidth;
    strip.classList.add("resizing");
    place();
    requestAnimationFrame(() => strip.classList.remove("resizing"));
  }).observe(strip);

  return {
    el: strip,
    update(s: LiveView | null, now: number) {
      const next = s ? heldInputs(s) : new Set<string>();
      for (const item of items) if (item.end === null && !next.has(item.name)) item.end = now;
      const added = [...next].filter((name) => !held.has(name));
      for (const name of added) {
        const label = el("small");
        const item = el("span", { className: `in in-${name}` }, [label]);
        item.insertAdjacentHTML("afterbegin", HISTORY_ICONS[name] ?? name);
        const box = item.querySelector("svg")?.viewBox.baseVal;
        if (box?.height) item.style.setProperty("--a", String(box.width / box.height));
        // a new press starts a little to the right, transparent, and moves in with the others
        item.style.transform = `translateX(${ENTER * strip.clientWidth}px)`;
        item.style.opacity = "0";
        strip.append(item);
        items.unshift({ name, start: now, end: null, el: item, frames: label });
        if (items.length > ITEMS) {
          const gone = items.pop()!;
          gone.el.style.opacity = "0";
          setTimeout(() => gone.el.remove(), LEAVE_MS);
        }
      }
      if (added.length) requestAnimationFrame(() => requestAnimationFrame(place));
      held = next;
      // the held ones stay lit and keep counting
      for (const item of items) {
        item.el.classList.toggle("held", item.end === null);
        const count = frames(item, now);
        if (item.frames.textContent !== count) item.frames.textContent = count;
      }
    },
  };
}
