import { unzipSync } from "fflate";
import { MAX_PACKAGE_BYTES } from "./constants.ts";
import type { SkinFiles } from "./types.ts";

const normalize = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "");

/** An in-memory package (tests, Studio). Strings are stored as UTF-8. */
export function filesFromMap(files: Record<string, Uint8Array | string>): SkinFiles {
  const encoder = new TextEncoder();
  const entries = new Map(
    Object.entries(files).map(([path, data]) => [normalize(path), typeof data === "string" ? encoder.encode(data) : data]),
  );
  return {
    list: () => [...entries.keys()],
    read: async (path) => {
      const data = entries.get(normalize(path));
      if (!data) throw new Error(`File not found in package: ${path}`);
      return data;
    },
  };
}

/**
 * A `.ninjoyskin` archive (zip). Sizes are checked against the declared uncompressed sizes
 * before anything is inflated, so a tiny "zip bomb" cannot exhaust memory. A damaged archive
 * yields an empty package (reported as a missing manifest).
 */
export function filesFromZip(archive: Uint8Array): SkinFiles {
  let declared = 0;
  let entries: Record<string, Uint8Array> = {};
  try {
    entries = unzipSync(archive, {
      filter: (file) => {
        declared += file.originalSize;
        return declared <= MAX_PACKAGE_BYTES && !file.name.endsWith("/");
      },
    });
  } catch {
    entries = {};
  }
  const files = filesFromMap(declared > MAX_PACKAGE_BYTES ? {} : entries);
  return { ...files, size: () => declared };
}
