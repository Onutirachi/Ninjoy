import type { LayoutEdit } from "../engine/layout.ts";
import type { HitTester } from "./hit-test.ts";
import type { Rendered } from "./renderer.ts";

export const MIN_GROUP_SCALE = 0.5;
export const MAX_GROUP_SCALE = 2;

export interface EditorHooks {
  radius(): number;
  edits(): Record<string, LayoutEdit>;
  /** a group moved or was resized; `done` = end of the gesture (persist) */
  change(group: string, edit: LayoutEdit, done: boolean): void;
  selected(group: string | null): void;
}

/**
 * Edit-layout gestures on the stage: touch a group (or a loose control) to select it and drag
 * to move it. Offsets are kept in canvas units so they scale with the controller size.
 */
export function createEditor(rendered: Rendered, hitTester: HitTester, hooks: EditorHooks) {
  let enabled = false;
  let selected: string | null = null;
  let drag: { id: number; x: number; y: number } | null = null;

  const groupAt = (x: number, y: number) => {
    const rc = rendered.controls.find((c) => hitTester.hits(c, x, y, hooks.radius()));
    return rc?.control.group ?? null;
  };
  const editOf = (group: string): LayoutEdit => hooks.edits()[group] ?? { dx: 0, dy: 0, scale: 1 };

  const select = (group: string | null) => {
    selected = group;
    for (const g of rendered.groups) g.el.toggleAttribute("data-selected", g.name === group);
    hooks.selected(group);
  };

  const { stage } = rendered;
  const onDown = (e: PointerEvent) => {
    if (!enabled || drag) return;
    e.preventDefault();
    const group = groupAt(e.clientX, e.clientY);
    select(group);
    if (!group) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      // the pointer is already gone (or synthetic)
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!enabled || !drag || drag.id !== e.pointerId || !selected) return;
    const group = rendered.groups.find((g) => g.name === selected)!;
    const edit = editOf(selected);
    // screen px per canvas unit of the offset: the group's scale without the player's own resize
    const ctm = group.el.getScreenCTM();
    const k = ctm ? Math.hypot(ctm.a, ctm.b) / edit.scale : 1;
    hooks.change(selected, { ...edit, dx: edit.dx + (e.clientX - drag.x) / k, dy: edit.dy + (e.clientY - drag.y) / k }, false);
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return;
    drag = null;
    if (selected) hooks.change(selected, editOf(selected), true);
  };

  stage.addEventListener("pointerdown", onDown);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerup", onUp);
  stage.addEventListener("pointercancel", onUp);

  return {
    get selected() { return selected; },
    setEnabled(on: boolean) {
      enabled = on;
      drag = null;
      stage.toggleAttribute("data-editing", on);
      if (!on) select(null);
    },
    select,
    /** Resizes the selected group around its own center. */
    setScale(scale: number) {
      if (!selected) return;
      const s = Math.min(MAX_GROUP_SCALE, Math.max(MIN_GROUP_SCALE, scale));
      hooks.change(selected, { ...editOf(selected), scale: s }, true);
    },
    dispose() {
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
    },
  };
}
