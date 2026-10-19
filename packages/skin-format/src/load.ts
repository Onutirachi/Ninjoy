import { FORMAT_VERSION, MANIFEST_PATH, MAX_PACKAGE_BYTES } from "./constants.ts";
import { ReportCollector } from "./report.ts";
import { resolveSkin, type LoadedControl } from "./resolve.ts";
import type { LoadResult, Manifest, SkinFiles } from "./types.ts";
import { validateSchema } from "./validate/schema.ts";
import { checkElements, checkManifest } from "./validate/semantics.ts";
import { scanSvg } from "./validate/svg.ts";

const decoder = new TextDecoder("utf-8", { fatal: false });

/** Loads, validates and resolves a skin package. Never executes skin content or fetches anything. */
export async function loadSkin(files: SkinFiles): Promise<LoadResult> {
  const report = new ReportCollector();
  const fail = (): LoadResult => ({ ok: false, report: report.entries });

  // 1. package size and manifest
  const paths = files.list();
  const contents = new Map<string, Uint8Array>();
  let bytes = 0;
  for (const path of paths) {
    const data = await files.read(path);
    contents.set(path, data);
    bytes += data.byteLength;
  }
  if (bytes > MAX_PACKAGE_BYTES) {
    report.error("package-too-large", { bytes, max: MAX_PACKAGE_BYTES });
    return fail();
  }
  const manifestBytes = contents.get(MANIFEST_PATH);
  if (!manifestBytes) {
    report.error("missing-manifest");
    return fail();
  }

  // 2. JSON and schema
  let manifest: Manifest;
  try {
    manifest = JSON.parse(decoder.decode(manifestBytes)) as Manifest;
  } catch (err) {
    report.error("invalid-json", { reason: err instanceof Error ? err.message : String(err) });
    return fail();
  }
  if (typeof manifest?.format === "number" && manifest.format > FORMAT_VERSION) {
    report.error("unsupported-format", { value: manifest.format });
    return fail();
  }
  if (!validateSchema(manifest, report)) return fail();

  // 3. skin-level rules
  checkManifest(manifest, new Set(paths), report);

  // 4. control artwork
  const loaded: LoadedControl[] = [];
  for (const control of manifest.controls) {
    const data = contents.get(control.svg);
    if (!data) {
      report.error("missing-file", { file: control.svg, control: control.id });
      continue;
    }
    const text = decoder.decode(data);
    const scan = scanSvg(text, control.svg, report);
    if (!scan) continue;
    checkElements(control, scan, report);
    loaded.push({ control, text, scan });
  }

  if (report.hasErrors) return fail();
  return { ok: true, skin: resolveSkin(manifest, loaded), report: report.entries };
}
