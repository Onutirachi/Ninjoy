import { filesFromMap, formatReportEntry, loadSkin, type ResolvedSkin } from "@ninjoy/skin-format";

const manifest = import.meta.glob("../../skins/ninjoy/skin.json", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const controls = import.meta.glob("../../skins/ninjoy/controls/*.svg", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;

const ROOT = "../../skins/ninjoy/";

/** The official skin bundled with the page: used when the host's library cannot be reached. */
export async function loadOfficialSkin(): Promise<ResolvedSkin> {
  const files: Record<string, string | Uint8Array> = {};
  for (const [path, text] of Object.entries({ ...manifest, ...controls })) files[path.slice(ROOT.length)] = text;
  // the preview image is only shown by the host; an empty placeholder satisfies the package check
  files["preview.png"] = new Uint8Array();
  const result = await loadSkin(filesFromMap(files));
  if (!result.ok) throw new Error(`The official skin is invalid:\n${result.report.map((e) => formatReportEntry(e)).join("\n")}`);
  return result.skin;
}

/** The host's skin library (`/skins/index.json`). */
export interface SkinIndex {
  default: string;
  skins: { id: string; name: string; author: string; version: string; format: number; files: string[]; preview?: string | null }[];
}

export async function fetchSkinIndex(fetcher: typeof fetch = fetch): Promise<SkinIndex> {
  const response = await fetcher("/skins/index.json");
  if (!response.ok) throw new Error(`skin list: HTTP ${response.status}`);
  return (await response.json()) as SkinIndex;
}

/** Loads (and validates) a skin from the host's library. */
export async function loadSkinFromHost(entry: SkinIndex["skins"][number], fetcher: typeof fetch = fetch): Promise<ResolvedSkin> {
  const files: Record<string, Uint8Array> = {};
  await Promise.all(
    entry.files.map(async (path) => {
      const response = await fetcher(`/skins/${entry.id}/${path}`);
      if (!response.ok) throw new Error(`${entry.id}/${path}: HTTP ${response.status}`);
      files[path] = new Uint8Array(await response.arrayBuffer());
    }),
  );
  const result = await loadSkin(filesFromMap(files));
  if (!result.ok) throw new Error(`The skin "${entry.name}" is invalid:\n${result.report.map((e) => formatReportEntry(e)).join("\n")}`);
  return result.skin;
}

/** The skin to use: the phone's choice when the host still has it, else the host's default. */
export function pickSkin(index: SkinIndex, chosen: string | null): { id: string; missing: boolean } {
  if (chosen && index.skins.some((s) => s.id === chosen)) return { id: chosen, missing: false };
  return { id: index.default, missing: chosen !== null };
}

const CHOSEN = "ninjoy.v1.skin";

/** The skin this phone picked (null = follow the host's default). */
export function chosenSkin(storage: Storage | null = globalThis.localStorage ?? null): string | null {
  try {
    return storage?.getItem(CHOSEN) || null;
  } catch {
    return null;
  }
}

export function saveChosenSkin(id: string | null, storage: Storage | null = globalThis.localStorage ?? null) {
  try {
    if (id) storage?.setItem(CHOSEN, id);
    else storage?.removeItem(CHOSEN);
  } catch {
    // blocked storage: the choice lasts until the page closes
  }
}
