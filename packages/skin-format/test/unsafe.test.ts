import { afterEach, describe, expect, it, vi } from "vitest";
import { loadInline } from "./helpers.ts";

const manifest = {
  format: 1, name: "Unsafe", author: "Tests", version: "1.0.0", orientation: "landscape",
  controls: [
    { id: "cross", type: "button", bindings: ["cross"], svg: "controls/cross.svg", box: { x: 0, y: 0, width: 100, height: 100 }, elements: { bg: { role: "base" } } },
    { id: "menu", type: "system", action: "menu", svg: "controls/cross.svg", box: { x: 200, y: 0, width: 100, height: 100 }, elements: { bg: { role: "base" } } },
  ],
};
const svg = (inner: string, prolog = "") =>
  `${prolog}<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><rect id="bg" width="100" height="100"/>${inner}</svg>`;
const load = (artwork: string, extra: Record<string, string | Uint8Array> = {}) =>
  loadInline(manifest, { "controls/cross.svg": artwork, ...extra });

// each case must reject the skin with this code
const UNSAFE: [name: string, artwork: string, code: string][] = [
  ["script element", svg(`<script>alert(1)</script>`), "unsafe-element"],
  ["event handler", svg(`<circle r="5" onclick="alert(1)"/>`), "unsafe-attribute"],
  ["event handler, any case", svg(`<circle r="5" OnMouseOver="x()"/>`), "unsafe-attribute"],
  ["foreignObject", svg(`<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>`), "unsafe-element"],
  ["iframe", svg(`<iframe src="x.html"/>`), "unsafe-element"],
  ["embed", svg(`<embed src="x.swf"/>`), "unsafe-element"],
  ["animate on href", svg(`<a><animate attributeName="href" to="javascript:alert(1)"/></a>`), "unsafe-element"],
  ["external image", svg(`<image href="https://example.com/x.png"/>`), "unsafe-reference"],
  ["protocol-relative image", svg(`<image href="//example.com/x.png"/>`), "unsafe-reference"],
  ["javascript link", svg(`<a xlink:href="javascript:alert(1)"><circle r="5"/></a>`), "unsafe-reference"],
  ["embedded SVG data", svg(`<image href="data:image/svg+xml;base64,PHN2Zy8+"/>`), "unsafe-reference"],
  ["absolute path", svg(`<image href="/etc/passwd"/>`), "unsafe-reference"],
  ["path leaving the package", svg(`<image href="../../secret.png"/>`), "unsafe-reference"],
  ["CSS @import", svg(`<style>@import url(theme.css);</style>`), "unsafe-css"],
  ["CSS external url", svg(`<style><![CDATA[.a{fill:url(https://example.com/x.svg#p)}]]></style>`), "unsafe-css"],
  ["style attribute url", svg(`<circle r="5" style="fill:url(//example.com/p)"/>`), "unsafe-css"],
  ["DOCTYPE entities", svg(``, `<!DOCTYPE svg [<!ENTITY x "boom">]>`), "unsafe-doctype"],
];

describe("unsafe skin content", () => {
  for (const [name, artwork, code] of UNSAFE) {
    it(`rejects ${name}`, async () => {
      const result = await load(artwork);
      expect(result.ok).toBe(false);
      expect(result.report.map((e) => e.code)).toContain(code);
      expect(result.report.find((e) => e.code === code)?.params.file).toBe("controls/cross.svg");
    });
  }

  it("accepts a local image inside the package", async () => {
    const result = await load(svg(`<image href="../images/a.png"/>`), { "images/a.png": new Uint8Array([137, 80, 78, 71]) });
    expect(result.report.filter((e) => e.severity !== "info")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("reports a local image that is missing", async () => {
    const result = await load(svg(`<image href="pic.png"/>`));
    expect(result.report).toContainEqual({ severity: "error", code: "missing-file", params: { file: "controls/pic.png", control: "cross" } });
  });

  it("accepts embedded raster images and local fragment references", async () => {
    const artwork = svg(`<defs><linearGradient id="g"/></defs><image href="data:image/png;base64,iVBORw0KGgo="/><circle r="5" fill="url(#g)"/><use href="#bg"/>`);
    const result = await load(artwork);
    expect(result.report.filter((e) => e.severity !== "info")).toEqual([]);
  });
});

describe("loading never executes or fetches skin content", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls neither fetch nor eval for any unsafe case", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("network access"); });
    const evalSpy = vi.fn(() => { throw new Error("code execution"); });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("eval", evalSpy);
    for (const [, artwork] of UNSAFE) await load(artwork);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(evalSpy).not.toHaveBeenCalled();
  });
});
