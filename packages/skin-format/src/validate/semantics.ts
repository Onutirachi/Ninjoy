import type { ReportCollector } from "../report.ts";
import type { Manifest, ManifestControl } from "../types.ts";
import type { SvgScan } from "./svg.ts";

/** Skin-level rules the schema cannot express (cross-references, counts, sums). */
export function checkManifest(_manifest: Manifest, _paths: Set<string>, _report: ReportCollector): void {
  // Filled in by the user stories (US3).
}

/** Element role rules for one control, using the ids found in its SVG. */
export function checkElements(_control: ManifestControl, _scan: SvgScan, _report: ReportCollector): void {
  // Filled in by the user stories (US2).
}
