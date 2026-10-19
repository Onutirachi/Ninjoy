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
