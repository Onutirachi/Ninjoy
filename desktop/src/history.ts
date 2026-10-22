/**
 * The input history, like a fighting game's training mode: one row per change of what is held
 * (direction and buttons), newest on top, with how many frames (60 per second) it was held.
 */

import type { LiveView } from "./bridge.ts";
import { el } from "./dom.ts";

/** DualShock 4 button bits, in the session's order (see pad.ts). */
const BITS = ["cross", "circle", "square", "triangle", "up", "down", "left", "right", "l1", "r1", "l2", "r2", "l3", "r3", "share", "options", "ps", "touchpad"];

/** The order buttons are listed in a row. */
const ORDER = ["square", "cross", "circle", "triangle", "l1", "r1", "l2", "r2", "l3", "r3", "share", "options", "ps", "touchpad"];

/**
 * Icons by name. Placeholders until the drawn icons arrive: each value is the markup shown inside
 * the icon's badge (text now, an inline SVG later).
 */
export const HISTORY_ICONS: Record<string, string> = {
  up: "↑", upright: "↗", right: "→", downright: "↘", down: "↓", downleft: "↙", left: "←", upleft: "↖",
  square: "□", cross: "✕", circle: "○", triangle: "△",
  l1: "L1", r1: "R1", l2: "L2", r2: "R2", l3: "L3", r3: "R3",
  share: "SH", options: "OP", ps: "PS", touchpad: "TP",
};

const ROWS = 8;
const FRAME_MS = 1000 / 60;
/** the left stick counts as a direction past this much of its travel */
const STICK_DIRECTION = 0.5;

/** The direction held (d-pad first, else the left stick), as one of 8 names, or null. */
export function directionOf(s: LiveView): string | null {
  const held = (name: string) => (s.buttons & (1 << BITS.indexOf(name))) !== 0;
  let x = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
  let y = (held("down") ? 1 : 0) - (held("up") ? 1 : 0);
  if (!x && !y) {
    const sx = s.sticks[0] / 32767;
    const sy = s.sticks[1] / 32767;
    if (Math.hypot(sx, sy) > STICK_DIRECTION) {
      const sector = Math.round(Math.atan2(sy, sx) / (Math.PI / 4));
      x = Math.round(Math.cos((sector * Math.PI) / 4));
      y = Math.round(Math.sin((sector * Math.PI) / 4));
    }
  }
  if (!x && !y) return null;
  return (y < 0 ? "up" : y > 0 ? "down" : "") + (x > 0 ? "right" : x < 0 ? "left" : "");
}

/** The buttons held, in display order (directions apart). */
export function buttonsOf(s: LiveView): string[] {
  return ORDER.filter((name) => (s.buttons & (1 << BITS.indexOf(name))) !== 0);
}

interface Entry {
  inputs: string[];
  start: number;
  end: number | null;
}

export function createHistory() {
  const list = el("ol", { className: "history" });
  const entries: Entry[] = [];
  let held = "";
  const frames = (e: Entry, now: number) => {
    const n = Math.max(1, Math.round(((e.end ?? now) - e.start) / FRAME_MS));
    return n > 99 ? "99+" : String(n);
  };
  const badge = (name: string) => {
    const b = el("span", { className: `in in-${name}` });
    b.innerHTML = HISTORY_ICONS[name] ?? name;
    return b;
  };
  const render = (now: number) =>
    list.replaceChildren(
      ...entries.map((e) => el("li", { className: e.end === null ? "held" : "" }, [el("b", { textContent: frames(e, now) }), ...e.inputs.map(badge)])),
    );

  return {
    el: list,
    update(s: LiveView | null, now: number) {
      const dir = s ? directionOf(s) : null;
      const inputs = [...(dir ? [dir] : []), ...(s ? buttonsOf(s) : [])];
      const key = inputs.join(" ");
      if (key !== held) {
        held = key;
        if (entries[0] && entries[0].end === null) entries[0].end = now;
        if (inputs.length) entries.unshift({ inputs, start: now, end: null });
        entries.length = Math.min(entries.length, ROWS);
        render(now);
      } else if (entries[0]?.end === null) {
        // only the row being held keeps counting
        list.firstElementChild!.firstElementChild!.textContent = frames(entries[0], now);
      }
    },
  };
}
