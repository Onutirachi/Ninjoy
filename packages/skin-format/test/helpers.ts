import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { filesFromMap, loadSkin, type LoadResult } from "../src/index.ts";

export const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
export const OFFICIAL_SKIN = fileURLToPath(new URL("../../../skins/ninjoy", import.meta.url));

/** Reads a skin folder from disk into an in-memory package. */
export function readSkinFolder(dir: string, exclude: string[] = []): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path).split(sep).join("/")] = readFileSync(path);
    }
  };
  walk(dir);
  for (const path of exclude) delete files[path];
  return files;
}

/** Loads an in-memory package built from a manifest object and SVG strings. */
export function loadInline(manifest: object, files: Record<string, string | Uint8Array> = {}): Promise<LoadResult> {
  return loadSkin(filesFromMap({ "skin.json": JSON.stringify(manifest), ...files }));
}

export const codes = (result: LoadResult) => result.report.map((e) => e.code);
