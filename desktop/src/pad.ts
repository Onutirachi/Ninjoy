/** The live drawing of a controller (from the prototype) and the phone turning with the gyro. */

import type { LiveView } from "./bridge.ts";
import { el, html } from "./dom.ts";

/** DualShock 4 button bits, in the session's order. */
const BUTTONS = ["cross", "circle", "square", "triangle", "up", "down", "left", "right", "l1", "r1", "l2", "r2", "l3", "r3", "share", "options", "ps", "touchpad"];

const STICKS = { left: [61.29, 61.29], right: [103.22, 61.29] } as const;
/** the stick dots move inside their round areas (radius 18.87) */
const STICK_TRAVEL = 15.5;
/** a stick this close to the center shows no dot */
const STICK_REST = 0.03;
const TRIGGER_TOP = 80.2;
const TRIGGER_LEN = 38;
/** the touchpad well in drawing units */
const TOUCH = { x: 42.5, y: 0.5, w: 79.5, h: 37.2 };

const PAD_SVG = `<svg class="pad" viewBox="-6 -6 176.5 113.6" aria-hidden="true">
  <defs><clipPath id="clip-l2"><path d="M8.88 42.42c-4.63,0 -8.38,3.76 -8.38,8.39l0 20.96c0,4.63 3.75,8.39 8.38,8.39 4.63,0 8.39,-3.76 8.39,-8.39l0 -20.96c0,-4.63 -3.76,-8.39 -8.39,-8.39z"/></clipPath><clipPath id="clip-r2"><path d="M155.63 42.42c4.63,0 8.39,3.76 8.39,8.39l0 20.96c0,4.63 -3.76,8.39 -8.39,8.39 -4.63,0 -8.39,-3.76 -8.39,-8.39l0 -20.96c0,-4.63 3.76,-8.39 8.39,-8.39z"/></clipPath></defs>
  <path class="well" d="M50.81 0.5l62.89 0c4.61,0 8.39,3.77 8.39,8.38l0 20.96c0,4.62 -3.78,8.39 -8.39,8.39l-62.89 0c-4.61,0 -8.39,-3.77 -8.39,-8.39l0 -20.96c0,-4.61 3.78,-8.38 8.39,-8.38z"/>
  <circle class="dot" data-touch="0" r="2.6" cx="82" cy="19" visibility="hidden"/><circle class="dot" data-touch="1" r="2.6" cx="82" cy="19" visibility="hidden"/>
  <circle class="ctl" data-b="up" cx="19.36" cy="7.83" r="7.34"/><circle class="ctl" data-b="right" cx="30.89" cy="19.36" r="7.34"/>
  <circle class="ctl" data-b="down" cx="19.36" cy="30.89" r="7.34"/><circle class="ctl" data-b="left" cx="7.83" cy="19.36" r="7.34"/>
  <circle class="ctl" data-b="triangle" cx="145.15" cy="7.83" r="7.34"/><circle class="ctl" data-b="circle" cx="156.68" cy="19.36" r="7.34"/>
  <circle class="ctl" data-b="cross" cx="145.15" cy="30.89" r="7.34"/><circle class="ctl" data-b="square" cx="133.62" cy="19.36" r="7.34"/>
  <path class="well" d="M8.88 42.42c-4.63,0 -8.38,3.76 -8.38,8.39l0 20.96c0,4.63 3.75,8.39 8.38,8.39 4.63,0 8.39,-3.76 8.39,-8.39l0 -20.96c0,-4.63 -3.76,-8.39 -8.39,-8.39z"/><rect class="trig" data-trig="0" clip-path="url(#clip-l2)" x="0" y="80.2" width="18" height="0"/>
  <path class="well" d="M155.63 42.42c4.63,0 8.39,3.76 8.39,8.39l0 20.96c0,4.63 -3.76,8.39 -8.39,8.39 -4.63,0 -8.39,-3.76 -8.39,-8.39l0 -20.96c0,-4.63 3.76,-8.39 8.39,-8.39z"/><rect class="trig" data-trig="1" clip-path="url(#clip-r2)" x="146.7" y="80.2" width="18" height="0"/>
  <circle class="ctl" data-b="l1" cx="29.85" cy="50.81" r="8.39"/><circle class="ctl" data-b="l3" cx="29.85" cy="71.77" r="8.39"/>
  <circle class="ctl" data-b="r1" cx="134.67" cy="50.81" r="8.39"/><circle class="ctl" data-b="r3" cx="134.67" cy="71.77" r="8.39"/>
  <circle class="well" cx="61.29" cy="61.29" r="18.87"/><circle class="dot" data-stick="left" cx="61.29" cy="61.29" r="2.6" visibility="hidden"/>
  <circle class="well" cx="103.22" cy="61.29" r="18.87"/><circle class="dot" data-stick="right" cx="103.22" cy="61.29" r="2.6" visibility="hidden"/>
  <path class="ctl" data-b="share" d="M66.55 101.12c1.73,0 3.14,-1.41 3.14,-3.14l0 -10.48c0,-1.73 -1.41,-3.15 -3.14,-3.15 -1.73,0 -3.15,1.42 -3.15,3.15l0 10.48c0,1.73 1.42,3.14 3.15,3.14z"/><circle class="ctl" data-b="ps" cx="82.27" cy="92.74" r="8.39"/><path class="ctl" data-b="options" d="M97.96 101.12c1.73,0 3.15,-1.41 3.15,-3.14l0 -10.48c0,-1.73 -1.42,-3.15 -3.15,-3.15 -1.73,0 -3.14,1.42 -3.14,3.15l0 10.48c0,1.73 1.41,3.14 3.14,3.14z"/>
</svg>`;

export function createPad() {
  const svg = html(PAD_SVG) as SVGSVGElement;
  const parts = new Map<string, SVGElement>();
  for (const e of svg.querySelectorAll<SVGElement>("[data-b]")) parts.set(e.dataset.b!, e);
  const sticks = [...svg.querySelectorAll<SVGCircleElement>("[data-stick]")];
  const triggers = [...svg.querySelectorAll<SVGRectElement>("[data-trig]")];
  const touches = [...svg.querySelectorAll<SVGCircleElement>("[data-touch]")];

  return {
    el: svg,
    update(s: LiveView | null) {
      BUTTONS.forEach((name, bit) => parts.get(name)?.classList.toggle("on", !!s && (s.buttons & (1 << bit)) !== 0));
      sticks.forEach((stick, i) => {
        const [cx, cy] = STICKS[stick.dataset.stick as "left" | "right"];
        const x = s ? s.sticks[i * 2]! / 32767 : 0;
        const y = s ? s.sticks[i * 2 + 1]! / 32767 : 0;
        stick.setAttribute("cx", String(cx + x * STICK_TRAVEL));
        stick.setAttribute("cy", String(cy + y * STICK_TRAVEL));
        stick.setAttribute("visibility", Math.hypot(x, y) > STICK_REST ? "visible" : "hidden");
      });
      triggers.forEach((r, i) => {
        const f = s ? s.triggers[i]! / 255 : 0;
        r.setAttribute("y", String(TRIGGER_TOP - TRIGGER_LEN * f));
        r.setAttribute("height", String(TRIGGER_LEN * f));
      });
      touches.forEach((dot, i) => {
        const t = s?.touches[i];
        dot.setAttribute("visibility", t ? "visible" : "hidden");
        if (t) {
          dot.setAttribute("cx", String(TOUCH.x + (TOUCH.w * t[1]) / 65535));
          dot.setAttribute("cy", String(TOUCH.y + (TOUCH.h * t[2]) / 65535));
        }
      });
    },
  };
}

/**
 * The phone shape turning with the phone: tilt from gravity (screen frame, phone upright = flat),
 * turning from the gyro's up axis (spins back to the front when it stops).
 */
export function createMotion(preview: string, offText: () => string) {
  const phone = el("div", { className: "phone3d" }, ["front", "back", "top", "bottom", "left", "right"].map((f) => el("div", { className: `face ${f}` })));
  phone.style.setProperty("--preview", `url("${preview}")`);
  const values = el("small", { className: "gyro-vals" });
  const root = el("section", { className: "area motion" }, [el("div", { className: "scene" }, [phone]), values]);
  let yaw = 0;
  let pitch = 0;
  let roll = 0;
  let last = 0;
  return {
    el: root,
    update(s: LiveView | null, now: number) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (!s?.gyro || !s.rate || !s.accel) {
        yaw = 0;
        phone.style.transform = "rotateX(-12deg)";
        values.textContent = offText();
        return;
      }
      const [ax, ay, az] = s.accel;
      // tilt toward or away (around the screen's width) and sideways; the sideways angle uses
      // the whole remaining gravity, so it stays steady with the screen facing the ceiling
      const deg = 180 / Math.PI;
      const targetPitch = Math.atan2(az, ay) * deg;
      const targetRoll = Math.atan2(-ax, Math.hypot(ay, az)) * deg;
      // gravity is noisy: follow it smoothly, the short way around
      const smooth = 1 - Math.exp(-dt / 0.12);
      const turn = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;
      pitch += turn(pitch, targetPitch) * smooth;
      roll += turn(roll, targetRoll) * smooth;
      // turning (like a door) has no fixed reference: integrate the gyro and drift back to the
      // front over a few seconds, so turns read naturally
      yaw = (yaw + s.rate[1] * dt) * Math.exp(-dt / 4);
      phone.style.transform = `rotateX(${-12 + pitch}deg) rotateY(${yaw}deg) rotateZ(${roll}deg)`;
      values.textContent = `gyro ${s.rate.map((v) => v.toFixed(1)).join(" ")} °/s`;
    },
  };
}
