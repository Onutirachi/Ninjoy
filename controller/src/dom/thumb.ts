import type { ScreenBox } from "./hit-test.ts";
import type { RenderedControl } from "./renderer.ts";

const FOLLOW_MS = 25;
const RETURN_MS = 45;

/**
 * The stick thumb (thumb + thumb-label elements, moved together). Its center glides to a
 * target and back to where it was drawn. Only the drawing is smoothed; the stick value never is.
 */
export function createThumb(rc: RenderedControl) {
  const elements = rc.control.elements
    .filter((e) => e.role === "thumb" || e.role === "thumb-label")
    .map((e) => rc.elements.get(e.id))
    .filter((e): e is SVGElement => !!e);
  const original = elements.map((el) => el.getAttribute("transform") ?? "");
  const thumb = rc.control.elements.find((e) => e.role === "thumb");
  const thumbEl = thumb ? rc.elements.get(thumb.id) : undefined;

  /** current and target translation, in the control's own units */
  const pos = { x: 0, y: 0 };
  let target = { x: 0, y: 0, active: false };
  let frame = 0;
  let last = 0;

  const draw = () => elements.forEach((el, i) => el.setAttribute("transform", `translate(${pos.x} ${pos.y}) ${original[i]}`.trim()));

  const step = (t: number) => {
    const dt = Math.max(1, t - last);
    last = t;
    const k = 1 - Math.exp(-dt / (target.active ? FOLLOW_MS : RETURN_MS));
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    const done = Math.abs(target.x - pos.x) < 0.01 && Math.abs(target.y - pos.y) < 0.01;
    if (done) {
      pos.x = target.x;
      pos.y = target.y;
    }
    draw();
    frame = done ? 0 : requestAnimationFrame(step);
  };

  /** screen px per control unit */
  const scale = () => {
    const m = rc.svg.getScreenCTM();
    return m ? Math.hypot(m.a, m.b) : 1;
  };

  return {
    present: elements.length > 0,
    /**
     * The thumb at rest on screen: center and size relative to the stick's touch-area box
     * (rest offset kept as a ratio so it scales with the layout).
     */
    measure(area: ScreenBox) {
      if (!thumbEl) return { offset: { x: 0, y: 0 }, size: { x: 0, y: 0 } };
      const r = thumbEl.getBoundingClientRect();
      const s = scale();
      const cx = r.left + r.width / 2 - pos.x * s, cy = r.top + r.height / 2 - pos.y * s;
      return {
        offset: { x: (cx - (area.left + area.width / 2)) / area.width, y: (cy - (area.top + area.height / 2)) / area.height },
        size: { x: r.width / area.width, y: r.height / area.height },
      };
    },
    /** Moves the thumb by a screen offset from its rest position (0, 0 = rest). */
    moveTo(dx: number, dy: number, active: boolean) {
      if (!elements.length) return;
      const s = scale();
      target = { x: dx / s, y: dy / s, active };
      if (!frame && (target.x !== pos.x || target.y !== pos.y)) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
    },
  };
}
