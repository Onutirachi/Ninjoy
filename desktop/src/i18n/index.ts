import type { Language } from "../bridge.ts";
import en from "./en.json" with { type: "json" };
import pt from "./pt.json" with { type: "json" };

export type Locale = "en" | "pt";
export type MessageKey = keyof typeof en;

const CATALOGS: Record<Locale, Record<string, string>> = { en, pt };

/** The setting, else the first system language we support, else English. */
export function detectLanguage(setting: Language, systemLanguages: readonly string[]): Locale {
  if (setting !== "auto") return setting;
  for (const tag of systemLanguages) {
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
