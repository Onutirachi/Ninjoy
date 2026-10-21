import { Validator, type OutputUnit } from "@cfworker/json-schema";
import schema from "../../schema/skin-manifest.v2.schema.json" with { type: "json" };
import type { ReportCollector } from "../report.ts";

const validator = new Validator(schema as object, "2020-12", false);

// Keywords that point at the actual mistake. Everything else (allOf, if/then, $ref, properties,
// items, unevaluatedProperties...) is a consequence reported higher up the tree.
const VALUE_KEYWORDS = new Set([
  "enum", "const", "pattern", "type", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "propertyNames",
]);

const pointer = (location: string) => location.replace(/^#/, "") || "/";

function valueAt(doc: unknown, path: string): unknown {
  let node: unknown = doc;
  for (const raw of path.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

const show = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "undefined";
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

/** Validates the manifest structure and reports only the most specific problems. */
export function validateSchema(manifest: unknown, report: ReportCollector): boolean {
  const result = validator.validate(manifest);
  if (result.valid) return true;

  const errors: { kind: "value" | "missing" | "unexpected"; field: string }[] = [];
  for (const unit of result.errors as OutputUnit[]) {
    const at = pointer(unit.instanceLocation);
    if (VALUE_KEYWORDS.has(unit.keyword)) errors.push({ kind: "value", field: at });
    else if (unit.keyword === "required") {
      const name = /"([^"]+)"/.exec(unit.error)?.[1];
      errors.push({ kind: "missing", field: name ? `${at === "/" ? "" : at}/${name}` : at });
    } else if (unit.keyword === "false") errors.push({ kind: "unexpected", field: at });
  }

  // "Field not allowed" is a side effect when the same field (or something inside it) already
  // has a more specific error, e.g. an enum mismatch makes the type-specific branch fail.
  const specific = errors.filter((e) => e.kind !== "unexpected");
  const kept = errors.filter(
    (e) => e.kind !== "unexpected" || !specific.some((s) => s.field === e.field || s.field.startsWith(`${e.field}/`)),
  );

  const seen = new Set<string>();
  for (const e of kept) {
    const key = `${e.kind}:${e.field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.kind === "value") report.error("schema-invalid-value", { field: e.field, value: show(valueAt(manifest, e.field)) });
    else if (e.kind === "missing") report.error("schema-missing-field", { field: e.field });
    else report.error("schema-unexpected-field", { field: e.field });
  }
  return false;
}
