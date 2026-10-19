import en from "../messages/en.json" with { type: "json" };
import pt from "../messages/pt.json" with { type: "json" };
import type { ReportEntry, Severity } from "./types.ts";

/** Every report code and the parameters its messages may use. */
export const REPORT_CODES = {
  // package and manifest
  "missing-manifest": [],
  "invalid-json": ["reason"],
  "schema-invalid-value": ["field", "value"],
  "schema-missing-field": ["field"],
  "schema-unexpected-field": ["field"],
  "unsupported-format": ["value"],
  "package-too-large": ["bytes", "max"],
  "missing-file": ["file", "control"],
  "invalid-svg": ["file", "reason"],
  "unknown-field": ["field"],
  // controls and groups
  "duplicate-control": ["control"],
  "duplicate-group": ["group"],
  "unknown-control": ["group", "control"],
  "control-in-two-groups": ["control", "group"],
  "anchor-ignored": ["control", "group"],
  "outside-canvas": ["control"],
  "invalid-tuning": ["control", "field"],
  "no-menu": [],
  "no-preview": [],
  "unused-file": ["file"],
  // element roles
  "unknown-element": ["control", "element", "file"],
  "conflicting-roles": ["control", "element"],
  "missing-thumb": ["control"],
  "too-many-hitboxes": ["control"],
  "hitbox-not-single-shape": ["control", "element"],
  "missing-touch-area": ["control"],
  "role-not-allowed": ["control", "element", "role"],
  "role-ignored": ["control", "element", "role"],
  // unsafe content
  "unsafe-element": ["file", "element"],
  "unsafe-attribute": ["file", "element", "attribute"],
  "unsafe-reference": ["file", "element", "value"],
  "unsafe-css": ["file", "value"],
  "unsafe-doctype": ["file"],
} as const satisfies Record<string, readonly string[]>;

export type ReportCode = keyof typeof REPORT_CODES;
export type Locale = "en" | "pt";

const CATALOGS: Record<Locale, Record<string, string>> = { en, pt };

/** Collects report entries while a skin is loaded. */
export class ReportCollector {
  readonly entries: ReportEntry[] = [];

  add(severity: Severity, code: ReportCode, params: ReportEntry["params"] = {}): void {
    this.entries.push({ severity, code, params });
  }

  error(code: ReportCode, params?: ReportEntry["params"]): void { this.add("error", code, params); }
  warning(code: ReportCode, params?: ReportEntry["params"]): void { this.add("warning", code, params); }
  info(code: ReportCode, params?: ReportEntry["params"]): void { this.add("info", code, params); }

  get hasErrors(): boolean {
    return this.entries.some((e) => e.severity === "error");
  }
}

/** Human-readable message for a report entry, in the requested language (English fallback). */
export function formatReportEntry(entry: ReportEntry, locale: Locale = "en"): string {
  const template = CATALOGS[locale][entry.code] ?? CATALOGS.en[entry.code] ?? entry.code;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(entry.params[name] ?? `{${name}}`));
}
