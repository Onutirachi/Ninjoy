/** The Skins page: installed skins (the official one for now); importing comes later. */

import skin from "../../skins/ninjoy/skin.json" with { type: "json" };
import { el, html, icons } from "./dom.ts";
import type { I18n } from "./i18n/index.ts";

export function renderSkins(i18n: I18n, preview: string): HTMLElement {
  const { t } = i18n;
  const official = el("div", { className: "raised skin" }, [
    el("img", { src: preview, alt: "" }),
    el("div", { className: "row" }, [el("strong", { textContent: skin.name }), el("span", { className: "badge", textContent: t("skins.default") })]),
    el("small", { textContent: t("skins.official", { author: skin.author, version: skin.version }) }),
  ]);
  const arcade = el("div", { className: "raised skin soon" }, [
    el("img", { src: preview, alt: "", style: "filter: hue-rotate(140deg) saturate(1.3)" }),
    el("div", { className: "row" }, [el("strong", { textContent: "Ninjoy Arcade" })]),
    el("small", { textContent: t("skins.soon") }),
  ]);
  const add = el("button", { className: "skin add soon", type: "button", disabled: true }, [html(icons.plus), el("strong", { textContent: t("skins.import") }), el("small", { textContent: t("skins.importSoon") })]);
  return el("section", { className: "skins" }, [
    el("div", { className: "skins-head" }, [el("h1", { textContent: t("skins.title") }), el("p", { textContent: t("skins.hint") })]),
    el("div", { className: "skin-grid" }, [official, arcade, add]),
  ]);
}
