import type { ResolvedControl, ResolvedSkin } from "@ninjoy/skin-format";
import type { Controller } from "../dom/controller.ts";
import { MAX_GROUP_SCALE, MIN_GROUP_SCALE } from "../dom/edit.ts";
import { stickZones, triggerZones, type ControlOverride } from "../engine/settings.ts";
import type { I18n } from "../i18n/index.ts";
import { button, el, pct, slider, toggle } from "./widgets.ts";

/**
 * Toolbar of edit-layout mode: hint, size of the selected group, and per-stick / per-trigger
 * zones that can stop inheriting the menu values.
 */
export function createEditToolbar(o: { controller: Controller; skin: ResolvedSkin; i18n(): I18n; parent?: HTMLElement }) {
  const { controller, skin } = o;
  const bar = el("div", { className: "nj-edit" });
  bar.hidden = true;
  (o.parent ?? document.body).append(bar);
  let shownFor = "";

  const name = (c: ResolvedControl) => {
    const { t } = o.i18n();
    if (c.type === "trigger") return (c.trigger?.which ?? c.id).toUpperCase();
    return c.side === "right" ? t("control.stickRight") : t("control.stickLeft");
  };

  const tuning = (control: ResolvedControl) => {
    const { t } = o.i18n();
    const s = controller.settings;
    const own = controller.override(control.id);
    const percent = (v: number) => t("menu.size.value", { value: v });
    // a control that stops inheriting starts from the values it had
    const current = (): ControlOverride => {
      if (control.type === "stick") {
        const z = stickZones(control, s, own);
        return { inherit: false, stickDeadZone: z.deadZone, stickMaxZone: z.maxZone };
      }
      const z = triggerZones(control, s, own);
      return { inherit: false, triggerMinForce: z.minForce, triggerMaxZone: z.maxZone };
    };
    const values = own && !own.inherit ? own : current();
    const set = (patch: Partial<ControlOverride>) => controller.setOverride(control.id, { ...(controller.override(control.id) ?? current()), ...patch, inherit: false });
    const sliders = control.type === "stick"
      ? [
          slider({ label: t("menu.stickDeadZone"), min: 0, max: 40, value: pct(values.stickDeadZone ?? 0), format: percent, onInput: (v) => set({ stickDeadZone: v / 100 }) }),
          slider({ label: t("menu.stickMaxZone"), min: 0, max: 30, value: pct(values.stickMaxZone ?? 0), format: percent, onInput: (v) => set({ stickMaxZone: v / 100 }) }),
        ]
      : [
          slider({ label: t("menu.triggerMinForce"), min: 0, max: 50, value: pct(values.triggerMinForce ?? 0), format: percent, onInput: (v) => set({ triggerMinForce: v / 100 }) }),
          slider({ label: t("menu.triggerMaxZone"), min: 0, max: 50, value: pct(values.triggerMaxZone ?? 0), format: percent, onInput: (v) => set({ triggerMaxZone: v / 100 }) }),
        ];
    const inherits = !own || own.inherit;
    for (const sl of sliders) sl.input.disabled = inherits;
    const inherit = toggle(t("edit.inherit"), inherits, (on) => {
      controller.setOverride(control.id, on ? null : current());
      shownFor = "";
      render();
    });
    // collapsed by default so the toolbar leaves the controller visible
    return el("details", { className: "nj-tuning" }, [el("summary", { textContent: t("edit.tuning", { control: name(control) }) }), inherit.el, ...sliders.map((sl) => sl.el)]);
  };

  const render = () => {
    const { t } = o.i18n();
    const selection = controller.selection;
    const key = selection ? `${selection.group}` : "";
    if (key === shownFor && bar.childElementCount) return;
    shownFor = key;
    const children: HTMLElement[] = [
      el("div", { className: "nj-panel-head" }, [el("span", { className: "nj-hint", textContent: t("edit.hint") }), button(t("edit.done"), () => controller.setEditMode(false), "nj-close")]),
    ];
    if (selection) {
      children.push(slider({
        label: t("edit.size"), min: pct(MIN_GROUP_SCALE), max: pct(MAX_GROUP_SCALE), step: 5, value: pct(selection.scale),
        format: (v) => t("menu.size.value", { value: v }),
        onInput: (v) => controller.setGroupScale(v / 100),
      }).el);
      for (const { id } of selection.tunable) {
        const control = skin.controls.find((c) => c.id === id);
        if (control) children.push(tuning(control));
      }
    }
    bar.replaceChildren(...children);
    // keep the bar on the other half of the screen from the selected group
    const group = selection && document.querySelector(`[data-group="${CSS.escape(selection.group)}"]`)?.getBoundingClientRect();
    bar.dataset.side = group && group.left + group.width / 2 < window.innerWidth / 2 ? "right" : "left";
    if (!group) delete bar.dataset.side;
  };

  const unsubscribe = controller.onEditChange(() => {
    bar.hidden = !controller.editing;
    if (controller.editing) render();
    else shownFor = "";
  });

  return {
    dispose() {
      unsubscribe();
      bar.remove();
    },
  };
}
