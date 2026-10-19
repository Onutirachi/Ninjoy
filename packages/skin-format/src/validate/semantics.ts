import { BUILTIN, CANVAS } from "../constants.ts";
import type { ReportCollector } from "../report.ts";
import type { Manifest, ManifestControl, Role } from "../types.ts";
import type { SvgScan } from "./svg.ts";

const KNOWN_FIELDS = new Set([
  "$schema", "format", "name", "author", "version", "orientation", "preview",
  "background", "defaults", "groups", "controls", "extensions",
]);

/** Skin-level rules the schema cannot express (cross-references, counts, sums). */
export function checkManifest(manifest: Manifest, report: ReportCollector): void {
  for (const field of Object.keys(manifest)) {
    if (!KNOWN_FIELDS.has(field)) report.warning("unknown-field", { field });
  }

  const ids = new Set<string>();
  for (const control of manifest.controls) {
    if (ids.has(control.id)) report.error("duplicate-control", { control: control.id });
    ids.add(control.id);
  }

  const groupOf = new Map<string, string>();
  const groupNames = new Set<string>();
  for (const group of manifest.groups ?? []) {
    if (groupNames.has(group.name)) report.error("duplicate-group", { group: group.name });
    groupNames.add(group.name);
    for (const id of group.controls) {
      if (!ids.has(id)) report.error("unknown-control", { group: group.name, control: id });
      else if (groupOf.has(id)) report.error("control-in-two-groups", { control: id, group: group.name });
      else groupOf.set(id, group.name);
    }
  }

  const tuning = manifest.defaults?.tuning;
  for (const control of manifest.controls) {
    const at = { control: control.id };
    const group = groupOf.get(control.id);
    if (control.anchor && group) report.warning("anchor-ignored", { ...at, group });

    const { x, y, width, height } = control.box;
    if (x < 0 || y < 0 || x + width > CANVAS.width || y + height > CANVAS.height) report.warning("outside-canvas", at);

    if (control.type === "stick") {
      const t = { ...BUILTIN.stick, ...tuning?.stick, ...control.tuning };
      if (t.deadZone + t.maxZone >= 1) report.error("invalid-tuning", { ...at, field: "deadZone + maxZone" });
    }
    if (control.type === "trigger") {
      const t = { ...BUILTIN.trigger, ...tuning?.trigger, ...control.tuning };
      if (t.maxZone >= 1) report.error("invalid-tuning", { ...at, field: "maxZone" });
    }
  }

  if (!manifest.controls.some((c) => c.type === "system" && c.action === "menu")) report.warning("no-menu");
  if (!manifest.preview) report.info("no-preview");
}

const STICK_ONLY: Role[] = ["thumb", "thumb-label"];

/** Element role rules for one control, using the ids found in its SVG. */
export function checkElements(control: ManifestControl, scan: SvgScan, report: ReportCollector): void {
  const elements = Object.entries(control.elements ?? {});
  const at = { control: control.id };

  for (const [id] of elements) {
    if (!scan.ids.has(id)) report.error("unknown-element", { ...at, element: id, file: control.svg });
  }

  // a group's role applies to everything inside it; a descendant may repeat it but not change it
  const roleOf = new Map(elements.filter(([, e]) => e.role).map(([id, e]) => [id, e.role as Role]));
  for (const [id, role] of roleOf) {
    const info = scan.ids.get(id);
    const inherited = info?.insideGroupIds.map((g) => roleOf.get(g)).find((r) => r !== undefined);
    if (inherited && inherited !== role) report.error("conflicting-roles", { ...at, element: id });
  }

  const withRole = (role: Role) => [...roleOf].filter(([, r]) => r === role).map(([id]) => id);

  // touch area: one single-shape hitbox, or the union of the base elements
  const hitboxes = withRole("hitbox");
  if (hitboxes.length > 1) report.error("too-many-hitboxes", at);
  for (const id of hitboxes) {
    const info = scan.ids.get(id);
    if (info && !info.isShape) report.error("hitbox-not-single-shape", { ...at, element: id });
  }
  if (hitboxes.length === 0 && withRole("base").length === 0) report.error("missing-touch-area", at);

  if (control.type === "stick" && withRole("thumb").length === 0) report.error("missing-thumb", at);
  if (control.type !== "stick") {
    for (const role of STICK_ONLY) for (const id of withRole(role)) report.error("role-not-allowed", { ...at, element: id, role });
  }
  if (control.type !== "trigger") {
    for (const id of withRole("level")) report.warning("role-ignored", { ...at, element: id, role: "level" });
  }
}
