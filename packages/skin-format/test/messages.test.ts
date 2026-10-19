import { describe, expect, it } from "vitest";
import en from "../messages/en.json" with { type: "json" };
import pt from "../messages/pt.json" with { type: "json" };
import { formatReportEntry, REPORT_CODES } from "../src/report.ts";

const catalogs = { en, pt } as Record<string, Record<string, string>>;

describe("message catalogs", () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    it(`${locale} has a message for every report code`, () => {
      const missing = Object.keys(REPORT_CODES).filter((code) => !catalog[code]?.trim());
      expect(missing).toEqual([]);
    });

    it(`${locale} only uses parameters that the code declares`, () => {
      for (const [code, params] of Object.entries(REPORT_CODES)) {
        const used = [...(catalog[code] ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        for (const name of used) expect(params, `${locale}:${code} uses {${name}}`).toContain(name);
      }
    });

    it(`${locale} has no message for unknown codes`, () => {
      expect(Object.keys(catalog).filter((code) => !(code in REPORT_CODES))).toEqual([]);
    });
  }
});

describe("formatReportEntry", () => {
  const entry = { severity: "error", code: "missing-thumb", params: { control: "stick-left" } } as const;

  it("renders English", () => {
    expect(formatReportEntry(entry, "en")).toBe('Stick "stick-left" has no thumb element.');
  });

  it("renders Portuguese", () => {
    expect(formatReportEntry(entry, "pt")).toBe('O analógico "stick-left" não tem a bolinha (thumb).');
  });
});
