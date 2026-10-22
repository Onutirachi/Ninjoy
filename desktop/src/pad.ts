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
  <path class="ctl" data-b="touchpad" d="M50.81 0.5l62.89 0c4.61,0 8.39,3.77 8.39,8.38l0 20.96c0,4.62 -3.78,8.39 -8.39,8.39l-62.89 0c-4.61,0 -8.39,-3.77 -8.39,-8.39l0 -20.96c0,-4.61 3.78,-8.38 8.39,-8.38z"/>
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
  const canvas = el("canvas", { className: "scene" });
  const image = new Image();
  image.src = preview;
  const values = el("small", { className: "gyro-vals" });
  const root = el("section", { className: "area motion off" }, [canvas, values]);
  let yaw = 0;
  let pitch = 0;
  let roll = 0;
  let last = 0;
  let angles: [number, number, number] = [-12, 0, 0];
  const draw = () => drawPhone(canvas, image, angles);
  image.onload = draw;
  new ResizeObserver(draw).observe(canvas);
  return {
    el: root,
    /** the skin shown on the phone's screen */
    setPreview(url: string) {
      if (image.src !== new URL(url, location.href).href) image.src = url;
    },
    update(s: LiveView | null, now: number) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (!s?.gyro || !s.rate || !s.accel) {
        yaw = 0;
        angles = [-12, 0, 0];
        root.classList.add("off");
        draw();
        values.textContent = offText();
        return;
      }
      root.classList.remove("off");
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
      angles = [-12 + pitch, yaw, roll];
      draw();
      values.textContent = `gyro ${s.rate.map((v) => v.toFixed(1)).join(" ")} °/s`;
    },
  };
}

type V3 = [number, number, number];
type M3 = [V3, V3, V3];

const mul = (a: M3, b: M3): M3 => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j]! + row[1] * b[1][j]! + row[2] * b[2][j]!)) as M3;
const apply = (m: M3, v: V3): V3 => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]) as V3;

/** CSS `rotateX(x) rotateY(y) rotateZ(z)` (degrees; y down, z toward the viewer). */
function rotation([x, y, z]: [number, number, number]): M3 {
  const r = Math.PI / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x * r), Math.sin(x * r), Math.cos(y * r), Math.sin(y * r), Math.cos(z * r), Math.sin(z * r)];
  const rx: M3 = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
  const ry: M3 = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const rz: M3 = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  return mul(mul(rx, ry), rz);
}

/** A rounded rectangle's outline, clockwise on screen (y down). */
function outline(w: number, h: number, r: number): [number, number][] {
  const points: [number, number][] = [];
  const corners: [number, number, number][] = [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 6; i++) {
      const a = ((start + i * 15) * Math.PI) / 180;
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return points;
}

/**
 * Draws the phone as a rounded slab with the skin on its screen. Drawn on a canvas with its own
 * projection (not CSS 3D), so it looks the same in every web view, with or without a GPU.
 */
function drawPhone(canvas: HTMLCanvasElement, image: HTMLImageElement, angles: [number, number, number]) {
  const { width: cw, height: ch } = canvas.getBoundingClientRect();
  if (!cw || !ch) return;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const w = cw / 1.41;
  const h = w * 0.465;
  const d = w * 0.06;
  const perspective = w * 3.5;
  const m = rotation(angles);
  const project = (v: V3): [number, number] => {
    const [x, y, z] = apply(m, v);
    const s = perspective / (perspective - z);
    return [cw / 2 + x * s, ch / 2 + y * s];
  };
  // a face shows when it faces the viewer, who sits at (0, 0, perspective)
  const facing = (normal: V3, point: V3) => {
    const n = apply(m, normal);
    const p = apply(m, point);
    return n[0] * -p[0] + n[1] * -p[1] + n[2] * (perspective - p[2]) > 0;
  };
  const path = (points: [number, number][]) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const hue = getComputedStyle(canvas).getPropertyValue("--hue").trim() || "250";
  const shape = outline(w, h, Math.min(12, h * 0.2));
  const front = shape.map(([x, y]) => [x, y, d / 2] as V3);
  const back = shape.map(([x, y]) => [x, y, -d / 2] as V3);

  // edges: a convex slab, so the faces that show never overlap
  for (let i = 0; i < shape.length; i++) {
    const j = (i + 1) % shape.length;
    const [ax, ay] = shape[i]!;
    const [bx, by] = shape[j]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const normal: V3 = [(by - ay) / len, -(bx - ax) / len, 0];
    if (!facing(normal, front[i]!)) continue;
    const lit = apply(m, normal)[1]; // edges facing up are lighter
    const color = `oklch(${(0.31 - 0.07 * lit).toFixed(3)} 0.02 ${hue})`;
    path([front[i]!, front[j]!, back[j]!, back[i]!].map(project));
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6; // closes the hairlines between edge pieces
    ctx.fill();
    ctx.stroke();
  }
  if (facing([0, 0, -1], back[0]!)) {
    path(back.map(project));
    ctx.fillStyle = `oklch(0.3 0.02 ${hue})`;
    ctx.fill();
  }
  if (facing([0, 0, 1], front[0]!)) {
    const screen = front.map(project);
    ctx.save();
    path(screen);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.clip();
    if (image.complete && image.naturalWidth) {
      // the skin's preview at 88% of the width, centered (like `center / 88% auto`)
      const iw = w * 0.88;
      const ih = (iw * image.naturalHeight) / image.naturalWidth;
      drawImagePlane(ctx, image, (u, v) => project([-iw / 2 + u * iw, -ih / 2 + v * ih, d / 2]));
    }
    path(screen);
    ctx.strokeStyle = "#1b1f24";
    ctx.lineWidth = 6; // half of it inside the clip: a 3px frame
    ctx.stroke();
    ctx.restore();
  }
}

/** Draws an image onto a projected plane in small triangles (canvas only maps images affinely). */
function drawImagePlane(ctx: CanvasRenderingContext2D, image: HTMLImageElement, at: (u: number, v: number) => [number, number]) {
  const [cols, rows] = [8, 4];
  const [iw, ih] = [image.naturalWidth, image.naturalHeight];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [u0, u1, v0, v1] = [c / cols, (c + 1) / cols, r / rows, (r + 1) / rows];
      const p00 = at(u0, v0), p10 = at(u1, v0), p01 = at(u0, v1), p11 = at(u1, v1);
      triangle(ctx, image, [[u0 * iw, v0 * ih], [u1 * iw, v0 * ih], [u0 * iw, v1 * ih]], [p00, p10, p01]);
      triangle(ctx, image, [[u1 * iw, v0 * ih], [u1 * iw, v1 * ih], [u0 * iw, v1 * ih]], [p10, p11, p01]);
    }
  }
}

function triangle(ctx: CanvasRenderingContext2D, image: HTMLImageElement, src: [number, number][], dst: [number, number][]) {
  const [[s0x, s0y], [s1x, s1y], [s2x, s2y]] = src as [[number, number], [number, number], [number, number]];
  const [[d0x, d0y], [d1x, d1y], [d2x, d2y]] = dst as [[number, number], [number, number], [number, number]];
  const det = (s1x - s0x) * (s2y - s0y) - (s2x - s0x) * (s1y - s0y);
  if (!det) return;
  // the affine map taking the source triangle to the screen triangle
  const a = ((d1x - d0x) * (s2y - s0y) - (d2x - d0x) * (s1y - s0y)) / det;
  const b = ((d1y - d0y) * (s2y - s0y) - (d2y - d0y) * (s1y - s0y)) / det;
  const c = ((d2x - d0x) * (s1x - s0x) - (d1x - d0x) * (s2x - s0x)) / det;
  const dd = ((d2y - d0y) * (s1x - s0x) - (d1y - d0y) * (s2x - s0x)) / det;
  const e = d0x - a * s0x - c * s0y;
  const f = d0y - b * s0x - dd * s0y;
  ctx.save();
  // grow the triangle a little so neighbours meet without seams
  const [mx, my] = [(d0x + d1x + d2x) / 3, (d0y + d1y + d2y) / 3];
  ctx.beginPath();
  for (const [x, y] of dst) {
    const k = 1 + 0.6 / (Math.hypot(x - mx, y - my) || 1);
    ctx.lineTo(mx + (x - mx) * k, my + (y - my) * k);
  }
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}
