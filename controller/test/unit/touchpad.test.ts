import { describe, expect, it } from "vitest";
import { EntryOrder } from "../../src/engine/fingers.ts";
import { MAX_TOUCHES, touchpadPoint } from "../../src/engine/touchpad.ts";

describe("touchpadPoint", () => {
  it("maps the halves onto the single DS4 touchpad", () => {
    expect(touchpadPoint({ x: 0.5, y: 0.5 }, "left")).toEqual({ x: 0.25, y: 0.5 });
    expect(touchpadPoint({ x: 0.5, y: 0.5 }, "right")).toEqual({ x: 0.75, y: 0.5 });
    expect(touchpadPoint({ x: 0.3, y: 0.9 }, "full")).toEqual({ x: 0.3, y: 0.9 });
    expect(touchpadPoint({ x: 1.2, y: -0.1 }, "left")).toEqual({ x: 0.5, y: 0 });
  });
});

describe("touch selection", () => {
  it("keeps the two most recent touches", () => {
    const order = new EntryOrder<number>();
    order.track([1, 2, 3]);
    expect(order.recent(MAX_TOUCHES)).toEqual([2, 3]);
    order.track([1, 2]);
    expect(order.recent(MAX_TOUCHES)).toEqual([1, 2]);
  });
});
