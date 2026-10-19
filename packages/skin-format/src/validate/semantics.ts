import type { ReportCollector } from "../report.ts";
import type { Manifest, ManifestControl, Role } from "../types.ts";
import type { SvgScan } from "./svg.ts";

/** Skin-level rules the schema cannot express (cross-references, counts, sums). */
export function checkManifest(_manifest: Manifest, _paths: Set<string>, _report: ReportCollector): void {
  // Filled in by US3.
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
