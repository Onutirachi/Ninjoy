import { filesFromMap, formatReportEntry, loadSkin, type ResolvedSkin } from "@ninjoy/skin-format";

const manifest = import.meta.glob("../../skins/ninjoy/skin.json", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const controls = import.meta.glob("../../skins/ninjoy/controls/*.svg", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;

const ROOT = "../../skins/ninjoy/";

/** The official skin, bundled with the page until skins are served by the host. */
export async function loadOfficialSkin(): Promise<ResolvedSkin> {
  const files: Record<string, string | Uint8Array> = {};
  for (const [path, text] of Object.entries({ ...manifest, ...controls })) files[path.slice(ROOT.length)] = text;
  // the preview image is only shown by the host; an empty placeholder satisfies the package check
  files["preview.png"] = new Uint8Array();
  const result = await loadSkin(filesFromMap(files));
  if (!result.ok) throw new Error(`The official skin is invalid:\n${result.report.map((e) => formatReportEntry(e)).join("\n")}`);
  return result.skin;
}
