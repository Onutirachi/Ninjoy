import type { ResolvedSkin } from "@ninjoy/skin-format";
import type { Controller } from "../dom/controller.ts";
import { autoSize } from "../engine/layout.ts";
import { stickZones, triggerZones, type Language } from "../engine/settings.ts";
import type { I18n } from "../i18n/index.ts";
import { button, el, pct, slider, toggle } from "./widgets.ts";

export interface MenuOptions {
  controller: Controller;
  skin: ResolvedSkin;
  i18n(): I18n;
  /** the language setting changed */
  onLanguage(language: Language): void;
  onEditLayout(): void;
  /** "Controller 3" under the title while joined */
  subtitle?(): string | null;
  parent?: HTMLElement;
}

/** The player menu, opened by the skin's menu control. Every change applies and saves at once. */
export function createMenu(o: MenuOptions) {
  const { controller, skin } = o;
  const overlay = el("div", { className: "nj-overlay" });
  overlay.hidden = true;
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  (o.parent ?? document.body).append(overlay);

  // zones shown when the player has not set them: the skin's (first stick / trigger)
  const firstStick = skin.controls.find((c) => c.type === "stick");
  const firstTrigger = skin.controls.find((c) => c.type === "trigger");

  const close = () => {
    overlay.hidden = true;
    overlay.replaceChildren();
  };

  const render = () => {
    const { t } = o.i18n();
    const s = controller.settings;
    const sz = s.size === "auto" ? autoSize(window.innerHeight) : s.size;
    const auto = button(t("menu.size.auto"), () => {
      controller.updateSettings({ size: "auto" });
      size.set(pct(autoSize(window.innerHeight)));
      auto.classList.add("on");
    }, s.size === "auto" ? "nj-chip on" : "nj-chip");
    const size = slider({
      label: t("menu.size"), min: 40, max: 100, value: pct(sz), extra: auto,
      format: (v) => t("menu.size.value", { value: v }),
      onInput: (v) => {
        auto.classList.remove("on");
        controller.updateSettings({ size: v / 100 });
      },
    });
    const percent = (v: number) => t("menu.size.value", { value: v });
    const sticks = stickZones(firstStick ?? {}, s);
    const triggers = triggerZones(firstTrigger ?? {}, s);
    const zone = (key: "stickDeadZone" | "stickMaxZone" | "triggerMinForce" | "triggerMaxZone", value: number, max: number) =>
      slider({ label: t(`menu.${key}`), min: 0, max, value: pct(value), format: percent, onInput: (v) => controller.updateSettings({ [key]: v / 100 }) });
    const zones = [
      ...(firstStick ? [zone("stickDeadZone", sticks.deadZone, 40), zone("stickMaxZone", sticks.maxZone, 30)] : []),
      ...(firstTrigger ? [zone("triggerMinForce", triggers.minForce, 50), zone("triggerMaxZone", triggers.maxZone, 50)] : []),
    ];
    const language = el("select", {}, [
      el("option", { value: "auto", textContent: t("menu.language.auto") }),
      el("option", { value: "en", textContent: "English" }),
      el("option", { value: "pt", textContent: "Português" }),
    ]);
    language.value = s.language;
    language.addEventListener("change", () => {
      controller.updateSettings({ language: language.value as Language });
      o.onLanguage(language.value as Language);
      render();
    });

    const panel = el("div", { className: "nj-panel", role: "dialog", ariaLabel: t("menu.title") }, [
      el("div", { className: "nj-panel-head" }, [
        el("div", {}, [el("h2", { textContent: t("menu.title") }), ...(o.subtitle?.() ? [el("small", { className: "nj-menu-sub", textContent: o.subtitle() })] : [])]),
        button(t("menu.close"), close, "nj-close"),
      ]),
      size.el,
      slider({ label: t("menu.height"), min: 0, max: 100, value: pct(s.height), format: percent, onInput: (v) => controller.updateSettings({ height: v / 100 }) }).el,
      slider({ label: t("menu.finger"), min: 0, max: 40, value: s.finger, format: (v) => t("menu.px.value", { value: v }), onInput: (v) => controller.updateSettings({ finger: v }) }).el,
      ...zones.map((z) => z.el),
      ...(zones.length ? [button(t("menu.resetZones"), () => {
        controller.updateSettings({ stickDeadZone: undefined, stickMaxZone: undefined, triggerMinForce: undefined, triggerMaxZone: undefined });
        render();
      })] : []),
      toggle(t("menu.gyro"), controller.state.gyro, (on) => {
        controller.updateSettings({ gyro: on });
        // permission may be refused: show the real state once it settles
        setTimeout(() => !overlay.hidden && render(), 300);
      }).el,
      el("div", { className: "nj-buttons" }, [
        button(t("menu.fullscreen"), () => controller.toggleFullscreen()),
        button(t("menu.editLayout"), () => {
          close();
          o.onEditLayout();
        }),
        button(t("menu.resetLayout"), () => controller.resetLayout()),
      ]),
      el("label", { className: "nj-row" }, [el("div", { className: "nj-row-head" }, [el("span", { textContent: t("menu.language") })]), language]),
    ]);
    overlay.replaceChildren(panel);
  };

  return {
    get open() { return !overlay.hidden; },
    show() {
      controller.releaseAll();
      overlay.hidden = false;
      render();
    },
    close,
    dispose() {
      overlay.remove();
    },
  };
}
