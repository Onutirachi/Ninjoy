import { describe, expect, it } from "vitest";
import en from "../../src/i18n/en.json" with { type: "json" };
import pt from "../../src/i18n/pt.json" with { type: "json" };
import { createI18n, detectLanguage } from "../../src/i18n/index.ts";

describe("i18n", () => {
  it("has the same keys in every catalog", () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it("detects the language from the browser, falling back to English", () => {
    expect(detectLanguage("auto", ["pt-BR", "en"])).toBe("pt");
    expect(detectLanguage("auto", ["de-DE", "fr"])).toBe("en");
    expect(detectLanguage("auto", [])).toBe("en");
  });

  it("lets the player's choice win", () => {
    expect(detectLanguage("en", ["pt-BR"])).toBe("en");
    expect(detectLanguage("pt", ["en-US"])).toBe("pt");
  });

  it("interpolates parameters", () => {
    const t = createI18n("en").t;
    expect(t("menu.size.value", { value: 80 })).toBe("80%");
  });
});
