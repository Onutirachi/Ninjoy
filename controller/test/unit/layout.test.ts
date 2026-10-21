import { describe, expect, it } from "vitest";
import { applyMatrix, autoSize, fixedLine, groupTransform, viewWidth } from "../../src/engine/layout.ts";

const group = (anchor: "left" | "center" | "right", center = { x: 800, y: 360 }) => ({ anchor, center });
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe("layout", () => {
  it("is the identity at 100% on a 20:9 screen", () => {
    for (const anchor of ["left", "center", "right"] as const) {
      const m = groupTransform({ aspect: 1600 / 720, size: 1, height: 0, group: group(anchor) });
      close(applyMatrix(m, { x: 123, y: 456 }), { x: 123, y: 456 });
    }
  });

  it("keeps groups at their edges on wider screens", () => {
    const aspect = 2400 / 720; // view width 2400
    expect(viewWidth(aspect)).toBeCloseTo(2400);
    close(applyMatrix(groupTransform({ aspect, size: 1, height: 0, group: group("left") }), { x: 10, y: 0 }), { x: 10, y: 0 });
    close(applyMatrix(groupTransform({ aspect, size: 1, height: 0, group: group("right") }), { x: 1590, y: 0 }), { x: 2390, y: 0 });
    close(applyMatrix(groupTransform({ aspect, size: 1, height: 0, group: group("center") }), { x: 800, y: 0 }), { x: 1200, y: 0 });
  });

  it("shrinks everything to fit the width on narrower screens", () => {
    const aspect = 4 / 3; // view width 960 → fit 0.6
    const m = groupTransform({ aspect, size: 1, height: 0, group: group("right") });
    close(applyMatrix(m, { x: 1600, y: 720 }), { x: 960, y: 720 }); // right/bottom corner stays at the corner
    close(applyMatrix(m, { x: 1600, y: 0 }), { x: 960, y: 720 - 720 * 0.6 });
  });

  it("shrinks groups towards their anchor at the bottom and lifts them with height", () => {
    const m = groupTransform({ aspect: 1600 / 720, size: 0.5, height: 0, group: group("left") });
    close(applyMatrix(m, { x: 0, y: 720 }), { x: 0, y: 720 });
    close(applyMatrix(m, { x: 200, y: 0 }), { x: 100, y: 360 });
    const lifted = groupTransform({ aspect: 1600 / 720, size: 0.5, height: 1, group: group("left") });
    close(applyMatrix(lifted, { x: 0, y: 720 }), { x: 0, y: 360 }); // free space 360, fully used
  });

  it("scales player offsets with the size and resizes around the group's center", () => {
    const base = { aspect: 1600 / 720, height: 0, group: group("left", { x: 100, y: 600 }) };
    const at = (size: number) => applyMatrix(groupTransform({ ...base, size, edit: { dx: 100, dy: 0, scale: 1 } }), { x: 100, y: 600 });
    const full = at(1), half = at(0.5);
    expect(full.x).toBeCloseTo(200);
    expect(half.x).toBeCloseTo(100); // the 100-unit offset is halved too: relative layout kept
    const scaled = groupTransform({ ...base, size: 1, edit: { dx: 0, dy: 0, scale: 2 } });
    close(applyMatrix(scaled, { x: 100, y: 600 }), { x: 100, y: 600 }); // the center does not move
    close(applyMatrix(scaled, { x: 110, y: 600 }), { x: 120, y: 600 });
  });

  it("shrinks a group standing on a fixed group onto that group's top", () => {
    const aspect = 1600 / 720;
    const rest = { y: 450, at: fixedLine(450, aspect, 1) }; // a fixed group's top at 100%
    expect(rest.at).toBeCloseTo(450);
    const m = groupTransform({ aspect, size: 0.5, height: 0, group: group("center"), rest });
    close(applyMatrix(m, { x: 800, y: 450 }), { x: 800, y: 450 }); // still touching the fixed group
    close(applyMatrix(m, { x: 800, y: 350 }), { x: 800, y: 400 }); // half as far above it
    // standing on the bottom is the same as no rest at all
    const plain = groupTransform({ aspect, size: 0.5, height: 0.5, group: group("left") });
    const onBottom = groupTransform({ aspect, size: 0.5, height: 0.5, group: group("left"), rest: { y: 720, at: 720 } });
    close(applyMatrix(onBottom, { x: 10, y: 20 }), applyMatrix(plain, { x: 10, y: 20 }));
  });

  it("computes the automatic size from the screen height", () => {
    expect(autoSize(430)).toBe(1);
    expect(autoSize(300)).toBe(1);
    expect(autoSize(770)).toBeCloseTo(0.558, 3);
    expect(autoSize(2000)).toBe(0.4);
  });
});
