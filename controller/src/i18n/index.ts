import type { Language } from "../engine/settings.ts";
import en from "./en.json" with { type: "json" };
import pt from "./pt.json" with { type: "json" };

export type Locale = "en" | "pt";
export type MessageKey = keyof typeof en;

const CATALOGS: Record<Locale, Record<string, string>> = { en, pt };

/** Player choice → first browser language we support → English. */
export function detectLanguage(setting: Language, browserLanguages: readonly string[]): Locale {
  if (setting !== "auto") return setting;
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split("-")[0];
    if (base === "pt" || base === "en") return base;
  }
  return "en";
}

export function createI18n(locale: Locale) {
  const catalog = CATALOGS[locale];
  return {
    locale,
    t(key: MessageKey, params: Record<string, string | number> = {}): string {
      const template = catalog[key] ?? CATALOGS.en[key] ?? key;
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
    },
  };
}

export type I18n = ReturnType<typeof createI18n>;
