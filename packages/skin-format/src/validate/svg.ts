import { SaxesParser } from "saxes";
import type { ReportCollector } from "../report.ts";

const SHAPES = new Set(["path", "circle", "ellipse", "rect", "polygon", "polyline", "line", "text"]);

// Elements that can run code, embed other documents or play media (research R4).
const FORBIDDEN = new Set(["script", "foreignObject", "iframe", "object", "embed", "audio", "video"]);
const ANIMATIONS = new Set(["animate", "set", "animateTransform", "animateMotion"]);
const SAFE_DATA = /^data:image\/(png|jpeg|webp|gif)[;,]/i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

export interface SvgElementInfo {
  tag: string;
  isShape: boolean;
  isGroup: boolean;
  /** ids of the groups this element is inside, outermost first */
  insideGroupIds: string[];
}

export interface SvgScan {
  ids: Map<string, SvgElementInfo>;
  /** package files referenced by the SVG, relative to the SVG's folder */
  references: string[];
}

type Reference = { kind: "fragment" } | { kind: "file"; path: string } | { kind: "unsafe" };

/** Classifies an href or url() target. Only fragments, package files and raster data are safe. */
function classify(raw: string): Reference {
  const value = raw.trim();
  if (value === "" || value.startsWith("#")) return { kind: "fragment" };
  if (SAFE_DATA.test(value)) return { kind: "fragment" };
  if (SCHEME.test(value) || value.startsWith("/") || value.startsWith("\\")) return { kind: "unsafe" };
  const path = value.split(/[?#]/)[0] ?? "";
  return { kind: "file", path };
}

/**
 * Reads an SVG without rendering it: collects element ids and referenced files, and reports
 * anything that could run code, load external content or abuse the XML parser.
 * Returns null (and reports invalid-svg) when the file is not well-formed XML.
 */
export function scanSvg(text: string, file: string, report: ReportCollector): SvgScan | null {
  const parser = new SaxesParser({ xmlns: false });
  const ids = new Map<string, SvgElementInfo>();
  const references: string[] = [];
  const stack: { tag: string; id: string | null }[] = [];
  let failure: string | null = null;
  let root: string | null = null;
  let styleText: string | null = null;

  const reference = (element: string, value: string) => {
    const ref = classify(value);
    if (ref.kind === "unsafe") report.error("unsafe-reference", { file, element, value });
    else if (ref.kind === "file") references.push(ref.path);
  };

  const css = (source: string) => {
    if (/@import/i.test(source)) report.error("unsafe-css", { file, value: "@import" });
    for (const match of source.matchAll(CSS_URL)) {
      const target = match[2] ?? "";
      const ref = classify(target);
      if (ref.kind === "unsafe") report.error("unsafe-css", { file, value: `url(${target})` });
      else if (ref.kind === "file") references.push(ref.path);
    }
  };

  parser.on("error", (err) => { failure ??= err.message; });
  parser.on("doctype", (doctype) => {
    // an internal subset can declare entities (entity expansion, external entities)
    if (doctype.includes("[") || /<!ENTITY/i.test(doctype)) report.error("unsafe-doctype", { file });
  });
  parser.on("opentag", (node) => {
    const tag = node.name.replace(/^svg:/, "");
    root ??= tag;
    const attrs = node.attributes as Record<string, string>;

    if (FORBIDDEN.has(tag)) report.error("unsafe-element", { file, element: tag });
    if (ANIMATIONS.has(tag) && /^(xlink:)?href$/i.test(attrs.attributeName ?? "")) report.error("unsafe-element", { file, element: tag });

    for (const [name, value] of Object.entries(attrs)) {
      if (/^on/i.test(name)) report.error("unsafe-attribute", { file, element: tag, attribute: name });
      else if (/^(xlink:)?href$/i.test(name) || ((tag === "iframe" || tag === "embed") && name === "src")) reference(tag, value);
      else if (name === "style" || /url\(/i.test(value)) css(value);
    }

    const id = attrs.id ?? null;
    if (id !== null) {
      ids.set(id, {
        tag,
        isShape: SHAPES.has(tag),
        isGroup: tag === "g",
        insideGroupIds: stack.filter((s) => s.tag === "g" && s.id !== null).map((s) => s.id as string),
      });
    }
    if (tag === "style") styleText = "";
    if (!node.isSelfClosing) stack.push({ tag, id });
  });
  parser.on("text", (t) => { if (styleText !== null) styleText += t; });
  parser.on("cdata", (t) => { if (styleText !== null) styleText += t; });
  parser.on("closetag", (node) => {
    if (node.name.replace(/^svg:/, "") === "style" && styleText !== null) {
      css(styleText);
      styleText = null;
    }
    if (!node.isSelfClosing) stack.pop();
  });

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
