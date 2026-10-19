// Command line validator: node src/cli.ts <skin folder | file.ninjoyskin> [--lang en|pt]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { filesFromMap, filesFromZip } from "./files.ts";
import { loadSkin } from "./load.ts";
import { formatReportEntry, type Locale } from "./report.ts";
import type { SkinFiles } from "./types.ts";

function readFolder(dir: string): SkinFiles {
  const files: Record<string, Uint8Array> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path).split(sep).join("/")] = readFileSync(path);
    }
  };
  walk(dir);
  return filesFromMap(files);
}

const args = process.argv.slice(2);
const langIndex = args.indexOf("--lang");
const locale: Locale = langIndex >= 0 && args[langIndex + 1] === "pt" ? "pt" : "en";
const target = args.find((a, i) => !a.startsWith("--") && (langIndex < 0 || i !== langIndex + 1));

if (!target) {
  console.error("Usage: validate <skin folder | file.ninjoyskin> [--lang en|pt]");
  process.exit(2);
}

const files = statSync(target).isDirectory() ? readFolder(target) : filesFromZip(readFileSync(target));
const result = await loadSkin(files);

for (const entry of result.report) console.log(`[${entry.severity}] ${formatReportEntry(entry, locale)}`);
const count = (severity: string) => result.report.filter((e) => e.severity === severity).length;
console.log(`${count("error")} errors, ${count("warning")} warnings, ${count("info")} notes`);
if (result.ok) {
  console.log(`"${result.skin.meta.name}" ${result.skin.meta.version}: ${result.skin.controls.length} controls`);
  for (const c of result.skin.controls) console.log(`  ${c.id.padEnd(22)} ${c.type.padEnd(9)} ${c.anchor}`);
}
process.exit(result.ok ? 0 : 1);
