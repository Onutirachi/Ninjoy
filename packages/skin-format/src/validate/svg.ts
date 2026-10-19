import { SaxesParser } from "saxes";
import type { ReportCollector } from "../report.ts";

const SHAPES = new Set(["path", "circle", "ellipse", "rect", "polygon", "polyline", "line", "text"]);

export interface SvgElementInfo {
  tag: string;
  isShape: boolean;
  isGroup: boolean;
  /** ids of the groups this element is inside, outermost first */
  insideGroupIds: string[];
}

export interface SvgScan {
  ids: Map<string, SvgElementInfo>;
  /** relative package paths referenced by the SVG (images) */
  references: string[];
}

/**
 * Reads an SVG without rendering it: collects element ids and the files it references.
 * Returns null (and reports invalid-svg) when the file is not well-formed XML.
 */
export function scanSvg(text: string, file: string, report: ReportCollector): SvgScan | null {
  const parser = new SaxesParser({ xmlns: false });
  const ids = new Map<string, SvgElementInfo>();
  const references: string[] = [];
  const stack: { tag: string; id: string | null }[] = [];
  let failure: string | null = null;
  let root: string | null = null;

  parser.on("error", (err) => { failure ??= err.message; });
  parser.on("opentag", (node) => {
    const tag = node.name.replace(/^svg:/, "");
    root ??= tag;
    const attrs = node.attributes as Record<string, string>;
    const id = attrs.id ?? null;
    if (id !== null) {
      ids.set(id, {
        tag,
        isShape: SHAPES.has(tag),
        isGroup: tag === "g",
        insideGroupIds: stack.filter((s) => s.tag === "g" && s.id !== null).map((s) => s.id as string),
      });
    }
    const href = attrs.href ?? attrs["xlink:href"];
    if (tag === "image" && href && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#")) references.push(href);
    if (!node.isSelfClosing) stack.push({ tag, id });
  });
  parser.on("closetag", (node) => { if (!node.isSelfClosing) stack.pop(); });

  try {
    parser.write(text).close();
  } catch (err) {
    failure ??= err instanceof Error ? err.message : String(err);
  }
  if (!failure && root !== "svg") failure = "the root element is not <svg>";
  if (failure) {
    report.error("invalid-svg", { file, reason: failure });
    return null;
  }
  return { ids, references };
}
