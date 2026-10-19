import { describe, expect, it } from "vitest";
import { codes, loadInline } from "./helpers.ts";

const base = { format: 1, name: "Roles", author: "Tests", version: "1.0.0", orientation: "landscape" };
const box = { x: 100, y: 100, width: 200, height: 200 };
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle id="a" cx="50" cy="50" r="50"/>
  <circle id="b" cx="50" cy="50" r="30"/>
  <g id="grp"><circle id="inner" cx="50" cy="50" r="10"/><rect id="inner2" width="5" height="5"/></g>
</svg>`;

/** Loads a one-control skin (plus a menu, to avoid the no-menu warning) and returns its report codes. */
async function check(control: object) {
  const menu = { id: "menu", type: "system", action: "menu", svg: "c.svg", box, elements: { a: { role: "base" } } };
  const result = await loadInline({ ...base, controls: [{ id: "c", svg: "c.svg", box, ...control }, menu] }, { "c.svg": SVG });
  return result.report.filter((e) => e.severity !== "info").map((e) => e.code); // notes (e.g. no preview) are not about roles
}

describe("element role rules", () => {
  it("requires a thumb on sticks", async () => {
    expect(await check({ type: "stick", side: "left", elements: { a: { role: "base" } } })).toContain("missing-thumb");
  });

  it("allows only one hitbox", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "hitbox" }, b: { role: "hitbox" } } })).toContain("too-many-hitboxes");
  });

  it("requires the hitbox to be a single shape", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { grp: { role: "hitbox" } } })).toContain("hitbox-not-single-shape");
  });

  it("requires a touch area", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "label" } } })).toContain("missing-touch-area");
    expect(await check({ type: "button", bindings: ["cross"] })).toContain("missing-touch-area");
  });

  it("accepts several base elements without a hitbox", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "base" }, b: { role: "base" }, grp: { role: "base" } } })).toEqual([]);
  });

  it("only allows thumbs on sticks", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "base" }, b: { role: "thumb" } } })).toContain("role-not-allowed");
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "base" }, b: { role: "thumb-label" } } })).toContain("role-not-allowed");
  });

  it("ignores level outside triggers with a warning", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "base" }, b: { role: "level" } } })).toEqual(["role-ignored"]);
  });

  it("rejects elements that are not in the SVG", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "base" }, ghost: { role: "label" } } })).toContain("unknown-element");
  });

  it("rejects different roles on a group and its descendant", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "base" }, grp: { role: "label" }, inner: { role: "pressed" } } })).toContain("conflicting-roles");
  });

  it("allows a descendant to repeat its group's role or have colors only", async () => {
    expect(await check({ type: "button", bindings: ["cross"], elements: { a: { role: "base" }, grp: { role: "label" }, inner: { colors: { active: "#FFFFFF" } }, inner2: { role: "label" } } })).toEqual([]);
  });
});
