/** The Skins page: the skin library on this computer; the host chooses the default skin. */

import { filesFromMap, formatReportEntry, loadSkin } from "@ninjoy/skin-format";
import type { Bridge, SkinView } from "./bridge.ts";
import { el, html, icons } from "./dom.ts";
import type { I18n } from "./i18n/index.ts";

/** Preview images as object URLs, kept per skin version. */
const previews = new Map<string, Promise<string | null>>();

function preview(bridge: Bridge, s: SkinView): Promise<string | null> {
  const key = `${s.id}@${s.version}`;
  if (!previews.has(key)) {
    previews.set(
      key,
      s.preview
        ? bridge.skinFile(s.id, s.preview).then((bytes) => URL.createObjectURL(new Blob([bytes as BlobPart]))).catch(() => null)
        : Promise.resolve(null),
    );
  }
  return previews.get(key)!;
}

/** Validation results per skin version (null = valid). */
const checked = new Map<string, Promise<string | null>>();

/** Validates a skin with the skin format rules; resolves to the first error, or null. */
export function validateSkin(bridge: Bridge, s: SkinView, locale: "en" | "pt"): Promise<string | null> {
  const key = `${s.id}@${s.version}`;
  if (!checked.has(key)) {
    checked.set(
      key,
      (async () => {
        const files: Record<string, Uint8Array> = {};
        for (const path of s.files) files[path] = await bridge.skinFile(s.id, path);
        const result = await loadSkin(filesFromMap(files));
        const error = result.report.find((e) => e.severity === "error");
        return result.ok ? null : error ? formatReportEntry(error, locale) : "invalid skin";
      })().catch((e: unknown) => String(e)),
    );
  }
  return checked.get(key)!;
}

/**
 * Validates every skin the host has not marked broken yet and tells the host the broken ones,
 * so phones are never offered them.
 */
export async function checkLibrary(bridge: Bridge, skins: SkinView[], locale: "en" | "pt") {
  const broken: Record<string, string> = {};
  for (const s of skins) {
    if (s.bundled) continue; // shipped with Ninjoy and tested with it
    const error = s.broken ?? (await validateSkin(bridge, s, locale));
    if (error) broken[s.id] = error;
  }
  const known = Object.fromEntries(skins.filter((s) => s.broken).map((s) => [s.id, s.broken!]));
  if (JSON.stringify(broken) !== JSON.stringify(known)) await bridge.setBrokenSkins(broken);
}

export function renderSkins(o: { i18n: I18n; bridge: Bridge; skins: SkinView[]; onDefault(id: string): void }): HTMLElement {
  const { t } = o.i18n;
  const cards = o.skins.map((s) => {
    const img = el("img", { alt: "" });
    void preview(o.bridge, s).then((url) => {
      if (url) img.src = url;
    });
    const by = s.bundled ? t("skins.official", { author: s.author, version: s.version }) : t("skins.byAuthor", { author: s.author, version: s.version });
    const card = el("button", { type: "button", className: `raised skin${s.broken ? " broken" : ""}`, disabled: !!s.broken, ariaPressed: String(s.isDefault) }, [
      img,
      el("div", { className: "row" }, [el("strong", { textContent: s.name || s.id }), ...(s.isDefault ? [el("span", { className: "badge", textContent: t("skins.default") })] : [])]),
      el("small", { textContent: s.broken ? t("skins.broken", { reason: s.broken }) : by }),
    ]);
    card.dataset.skin = s.id;
    card.title = s.broken ? "" : t("skins.makeDefault");
    card.addEventListener("click", () => !s.isDefault && o.onDefault(s.id));
    return card;
  });
  const add = el("button", { className: "skin add soon", type: "button", disabled: true }, [html(icons.plus), el("strong", { textContent: t("skins.import") }), el("small", { textContent: t("skins.importSoon") })]);
  return el("section", { className: "skins" }, [
    el("div", { className: "skins-head" }, [el("h1", { textContent: t("skins.title") }), el("p", { textContent: t("skins.hint") })]),
    el("div", { className: "skin-grid" }, [...cards, add]),
  ]);
}
