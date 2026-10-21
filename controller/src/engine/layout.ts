/** Canvas every skin is drawn on. */
export const CANVAS_W = 1600;
export const CANVAS_H = 720;
/** Screen height (CSS px) of a landscape phone: the skin's natural size. */
export const PHONE_HEIGHT = 430;

/** 2D affine matrix [a b c d e f], same convention as SVG/DOMMatrix. */
export type Matrix = readonly [number, number, number, number, number, number];

export interface LayoutEdit { dx: number; dy: number; scale: number }

export interface LayoutInput {
  /** screen width / height */
  aspect: number;
  /** 0.4…1 */
  size: number;
  /** 0…1 */
  height: number;
  group: { anchor: "left" | "center" | "right"; center: { x: number; y: number } };
  edit?: LayoutEdit;
  /**
   * The canvas line the group stands on (`y`) and where that line is in the view (`at`): the
   * canvas bottom by default; the top of a fixed group below it, so the group shrinks onto it
   * instead of under it.
   */
  rest?: { y: number; at: number };
}

/** Where a canvas line of a fixed group (drawn at `defaultSize`, height 0) is in the view. */
export function fixedLine(y: number, aspect: number, defaultSize: number): number {
  const g = Math.min(1, viewWidth(aspect) / CANVAS_W) * defaultSize;
  return CANVAS_H - (CANVAS_H - y) * g;
}

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
const scale = (s: number): Matrix => [s, 0, 0, s, 0, 0];

export const applyMatrix = (m: Matrix, p: { x: number; y: number }) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

/** Width of the view in canvas units for a screen aspect ratio (the view is always 720 tall). */
export const viewWidth = (aspect: number) => CANVAS_H * aspect;

/** Automatic controller size from the screen height: 100% on phones, smaller on tablets. */
export function autoSize(screenHeight: number): number {
  return Math.min(1, Math.max(0.4, PHONE_HEIGHT / screenHeight));
}

/**
 * Transform from canvas units to view units for one group (data-model.md):
 * anchor + global size, then the player's offset (canvas units, so it scales with the size),
 * then the player's scale around the group's own center.
 */
export function groupTransform({ aspect, size, height, group, edit, rest }: LayoutInput): Matrix {
  const VW = viewWidth(aspect);
  const g = Math.min(1, VW / CANVAS_W) * size;
  const lift = height * Math.max(0, CANVAS_H - CANVAS_H * g);
  const ax = { left: 0, center: CANVAS_W / 2, right: CANVAS_W }[group.anchor];
  const sx = { left: 0, center: VW / 2, right: VW }[group.anchor];
  const { x: cx, y: cy } = group.center;
  const s = edit?.scale ?? 1;
  const { y: restY, at } = rest ?? { y: CANVAS_H, at: CANVAS_H };
  return [
    translate(sx, at - lift), scale(g), translate(-ax, -restY),
    translate(edit?.dx ?? 0, edit?.dy ?? 0),
    translate(cx, cy), scale(s), translate(-cx, -cy),
  ].reduce(multiply);
}
