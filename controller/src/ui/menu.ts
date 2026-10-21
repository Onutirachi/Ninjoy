import type { ResolvedSkin } from "@ninjoy/skin-format";
import logoNinja from "../../../assets/brand/logo-ninja.svg?raw";
import logoWord from "../../../assets/brand/logo-word.svg?raw";
import type { Controller } from "../dom/controller.ts";
import { autoSize } from "../engine/layout.ts";
import { stickZones, tapsVibrate, triggerZones, type Language, type Vibration } from "../engine/settings.ts";
import type { I18n } from "../i18n/index.ts";
import type { SkinIndex } from "../skins.ts";
import { icons } from "./icons.ts";
import { button, choices, el, iconButton, pct, slider, switchRow } from "./widgets.ts";

export interface MenuOptions {
  controller: Controller;
  skin: ResolvedSkin;
  i18n(): I18n;
  /** the language setting changed */
  onLanguage(language: Language): void;
  /** the vibration setting changed */
  onVibration?(vibration: Vibration): void;
  onEditLayout(): void;
  /** the joined controller's number, shown in the header */
  slot?(): number | null;
  /** the host's skins, the one in use and this phone's choice (null = the host's default) */
  skins?(): { index: SkinIndex; current: string; chosen: string | null; previewUrl(id: string, path: string): string } | null;
  /** the player picked a skin (null = follow the host's default) */
  onSkin?(id: string | null): void;
  parent?: HTMLElement;
}

const SECTIONS = ["layout", "touch", "motion", "vibration", "skins", "general"] as const;
type Section = (typeof SECTIONS)[number];

/** Short zone labels: the section headings already say "Sticks" / "Triggers". */
const ZONE_LABELS = {
  stickDeadZone: "menu.zone.dead",
  stickMaxZone: "menu.zone.stickMax",
  triggerMinForce: "menu.zone.minForce",
  triggerMaxZone: "menu.zone.triggerMax",
} as const;

/** Button taps while dragging the strength slider: at most one per this many ms. */
const TAP_PREVIEW_MS = 150;

/**
 * The player menu, opened by the skin's menu control: a side list of sections and the settings
 * of the chosen one. Every change applies and saves at once. While a layout or zone slider is
 * dragged the menu turns see-through (only that slider stays) so the controller shows behind.
 */
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
  let section: Section = "layout";
  let lastTap = -Infinity;

  const close = () => {
    controller.previewZones(null);
    overlay.classList.remove("nj-peek");
    overlay.hidden = true;
    overlay.replaceChildren();
  };

  /** see-through while dragging; zone sliders also draw their zones on the controller */
  const peek = (zones?: "stick" | "trigger") => (dragging: boolean) => {
    overlay.classList.toggle("nj-peek", dragging);
    if (zones) controller.previewZones(dragging ? zones : null);
  };

  const render = () => {
    const { t } = o.i18n();
    const s = controller.settings;
    const support = controller.support;
    const percent = (v: number) => t("menu.size.value", { value: v });

    // ----- layout
    const sz = s.size === "auto" ? autoSize(window.innerHeight) : s.size;
    const size = slider({
      label: t("menu.size"), min: 40, max: 100, value: pct(sz), vertical: true, format: percent,
      note: s.size === "auto" ? t("menu.size.auto") : undefined, onDrag: peek(),
      onInput: (v) => controller.updateSettings({ size: v / 100 }),
    });
    const layout = [
      el("div", { className: "nj-vpair" }, [
        size.el,
        slider({ label: t("menu.height"), min: 0, max: 100, value: pct(s.height), vertical: true, format: percent, note: t("menu.height.note"), onDrag: peek(), onInput: (v) => controller.updateSettings({ height: v / 100 }) }).el,
      ]),
      button(t("menu.size.useAuto"), () => {
        controller.updateSettings({ size: "auto" });
        render();
      }, `nj-link${s.size === "auto" ? " on" : ""}`),
    ];

    // ----- touch
    const sticks = stickZones(firstStick ?? {}, s);
    const triggers = triggerZones(firstTrigger ?? {}, s);
    const zone = (key: "stickDeadZone" | "stickMaxZone" | "triggerMinForce" | "triggerMaxZone", value: number, max: number, kind: "stick" | "trigger") =>
      slider({ label: t(ZONE_LABELS[key]), min: 0, max, value: pct(value), format: percent, onDrag: peek(kind), onInput: (v) => controller.updateSettings({ [key]: v / 100 }) }).el;
    // touches are circles of this radius: shown at the screen's scale next to the value
    const fingerDot = el("span", { className: "nj-finger-dot", ariaHidden: "true" });
    const sizeDot = (r: number) => (fingerDot.style.width = fingerDot.style.height = `${Math.max(4, 2 * r)}px`);
    sizeDot(s.finger);
    const touch = [
      slider({
        label: t("menu.finger"), min: 0, max: 40, value: s.finger, extra: fingerDot, format: (v) => t("menu.px.value", { value: v }), onDrag: peek(),
        onInput: (v) => {
          sizeDot(v);
          controller.updateSettings({ finger: v });
        },
      }).el,
      ...(firstStick ? [
        el("h4", { textContent: t("menu.sticks") }),
        el("div", { className: "nj-pair" }, [zone("stickDeadZone", sticks.deadZone, 40, "stick"), zone("stickMaxZone", sticks.maxZone, 30, "stick")]),
      ] : []),
      ...(firstTrigger ? [
        el("h4", { textContent: t("menu.triggers") }),
        el("div", { className: "nj-pair" }, [zone("triggerMinForce", triggers.minForce, 50, "trigger"), zone("triggerMaxZone", triggers.maxZone, 50, "trigger")]),
      ] : []),
      ...(firstStick || firstTrigger ? [button(t("menu.resetZones"), () => {
        controller.updateSettings({ stickDeadZone: undefined, stickMaxZone: undefined, triggerMinForce: undefined, triggerMaxZone: undefined });
        render();
      }, "nj-link")] : []),
    ];

    // ----- motion
    const motionReason = { available: null, insecure: t("notice.motionInsecure"), none: t("notice.noMotion") }[support.motion];
    const motion = [
      switchRow({
        label: t("menu.gyro"), hint: motionReason ?? t("menu.gyro.hint"), on: controller.state.gyro, disabled: motionReason !== null,
        onChange: (on) => {
          controller.updateSettings({ gyro: on });
          // permission may be refused: show the real state once it settles
          setTimeout(() => !overlay.hidden && render(), 300);
        },
      }).el,
    ];

    // ----- vibration
    const strength = slider({
      label: t("menu.tapStrength"), min: 0, max: 100, value: pct(s.tapStrength), format: percent,
      disabled: !support.vibration || !tapsVibrate(s.vibration),
      onInput: (v) => {
        controller.updateSettings({ tapStrength: v / 100 });
        if (performance.now() - lastTap >= TAP_PREVIEW_MS) {
          lastTap = performance.now();
          controller.previewTap();
        }
      },
    });
    const vibration = [
      ...(support.vibration ? [] : [el("p", { className: "nj-reason", textContent: t("notice.noVibration") })]),
      choices<Vibration>({
        name: "nj-vibration", label: t("menu.vibration"), value: s.vibration, className: "nj-grid2", disabled: !support.vibration,
        options: (["all", "game", "buttons", "off"] as const).map((v) => ({
          value: v, label: t(`menu.vibration.${v}`), note: t(`menu.vibration.${v}.note`),
          tag: v === "all" || v === "game" ? t("menu.experimental") : undefined,
        })),
        onChange: (v) => {
          controller.updateSettings({ vibration: v });
          o.onVibration?.(v);
          strength.input.disabled = !tapsVibrate(v);
        },
      }),
      strength.el,
    ];

    // ----- skins: the host's library; the choice stays on this phone
    const library = o.skins?.() ?? null;
    const skinChoices: Node[] = [];
    if (library) {
      const { index, current, chosen } = library;
      const nameOf = (id: string) => index.skins.find((s) => s.id === id)?.name ?? id;
      const group = el("div", { className: "nj-choices nj-skins", role: "radiogroup", ariaLabel: t("menu.section.skins") });
      const option = (value: string, title: string, sub: string, id: string | null) => {
        const input = el("input", { type: "radio", name: "nj-skin", value, checked: value === (chosen ?? "") });
        input.addEventListener("change", () => input.checked && o.onSkin?.(value || null));
        const tags: Node[] = [];
        if (id && id === index.default) tags.push(el("span", { className: "nj-tag nj-tag-plain", textContent: t("menu.skins.default") }));
        if (id && id === current) tags.push(el("span", { className: "nj-tag nj-tag-plain", textContent: t("menu.skins.inUse") }));
        const entry = id ? index.skins.find((s) => s.id === id) : undefined;
        const preview = entry?.preview ? [el("img", { className: "nj-skin-preview", src: library.previewUrl(entry.id, entry.preview), alt: "" })] : [];
        group.append(el("label", { className: "nj-choice nj-skin" }, [input, ...preview, el("span", {}, [el("strong", { textContent: title }, tags), el("small", { textContent: sub })])]));
      };
      option("", t("menu.skins.hostDefault", { name: nameOf(index.default) }), t("menu.skins.follow"), null);
      for (const s of index.skins) option(s.id, s.name, t("menu.skins.by", { author: s.author }), s.id);
      skinChoices.push(group);
    }

    // ----- general
    const general = [
      el("div", { className: "nj-actions" }, [
        iconButton(icons.fullscreen, t("menu.fullscreen"), () => controller.toggleFullscreen()),
        iconButton(icons.edit, t("menu.editLayout"), () => {
          close();
          o.onEditLayout();
        }),
        iconButton(icons.reset, t("menu.resetLayout"), () => controller.resetLayout()),
      ]),
      el("h4", { textContent: t("menu.language") }),
      choices<Language>({
        name: "nj-language", label: t("menu.language"), value: s.language, className: "nj-seg",
        options: [{ value: "auto", label: t("menu.language.auto") }, { value: "en", label: "English" }, { value: "pt", label: "Português" }],
        onChange: (language) => {
          controller.updateSettings({ language });
          o.onLanguage(language);
          render();
        },
      }),
    ];

    const content: Record<Section, Node[]> = { layout, touch, motion, vibration, skins: skinChoices, general };
    const hints: Partial<Record<Section, string>> = {
      layout: t("menu.layout.hint"), touch: t("menu.touch.hint"), motion: t("menu.motion.hint"), vibration: t("menu.vibration.hint"), skins: t("menu.skins.hint"),
    };
    // the skins section only when the host has a library
    const sections = SECTIONS.filter((key) => key !== "skins" || library !== null);
    const tabs = sections.map((key) => {
      const tab = el("button", { type: "button", className: "nj-tab", role: "tab", id: `nj-tab-${key}`, ariaSelected: String(key === section) }, [
        el("span", { className: "nj-icon", innerHTML: icons[key], ariaHidden: "true" }),
        el("span", { textContent: t(`menu.section.${key}`) }),
      ]);
      tab.setAttribute("aria-controls", `nj-section-${key}`);
      tab.addEventListener("click", () => {
        section = key;
        for (const other of tabs) other.ariaSelected = String(other === tab);
        for (const panel of panels) panel.hidden = panel.id !== `nj-section-${key}`;
      });
      return tab;
    });
    const panels = sections.map((key) => {
      const panel = el("section", { className: "nj-section", role: "tabpanel", id: `nj-section-${key}`, hidden: key !== section }, [
        el("h3", { textContent: t(`menu.section.${key}`) }),
        ...(hints[key] ? [el("p", { className: "nj-hint", textContent: hints[key] })] : []),
        ...content[key],
      ]);
      panel.setAttribute("aria-labelledby", `nj-tab-${key}`);
      return panel;
    });

    const slot = o.slot?.() ?? null;
    const close_ = el("button", { type: "button", className: "nj-close", ariaLabel: t("menu.close"), innerHTML: icons.close });
    close_.addEventListener("click", close);
    const panel = el("div", { className: "nj-menu", role: "dialog", ariaModal: "true", ariaLabel: t("menu.title") }, [
      el("div", { className: "nj-menu-head" }, [
        el("h2", { className: "nj-sr", textContent: t("menu.title") }),
        el("span", { className: "nj-menu-word", innerHTML: logoWord, ariaHidden: "true" }),
        ...(slot ? [el("span", { className: "nj-menu-slot" }, [el("b", { textContent: String(slot) }), t("menu.slot")])] : []),
        el("span", { className: "nj-spacer" }),
        close_,
      ]),
      el("nav", { className: "nj-rail", role: "tablist", ariaLabel: t("menu.title") }, tabs),
      el("div", { className: "nj-menu-main" }, panels),
      // behind the panel, outside the scrolling area
      el("div", { className: "nj-menu-mark", innerHTML: logoNinja, ariaHidden: "true" }),
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
      controller.previewZones(null);
      overlay.remove();
    },
  };
}
