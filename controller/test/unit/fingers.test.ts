import { describe, expect, it } from "vitest";
import { EntryOrder, StickFingers } from "../../src/engine/fingers.ts";

describe("StickFingers", () => {
  it("keeps a finger until it is released", () => {
    const s = new StickFingers();
    s.grab("left", 1, 0);
    expect(s.stickOf(1)).toBe("left");
    s.grab("right", 1, 10); // already held by the left stick
    expect(s.stickOf(1)).toBe("left");
    s.release(1, 500);
    expect(s.owner("left")).toBeUndefined();
  });

  it("lets the newest finger win and the previous take over", () => {
    const s = new StickFingers();
    s.grab("left", 1, 0);
    s.grab("left", 2, 100);
    expect(s.owner("left")).toBe(2);
    s.release(2, 600);
    expect(s.owner("left")).toBe(1);
  });

  it("clicks on a double-tap and hold", () => {
    const s = new StickFingers();
    s.grab("left", 1, 0);
    s.release(1, 200); // 200 ms tap
    s.grab("left", 2, 450); // 250 ms later
    expect(s.clicking("left")).toBe(true);
    s.release(2, 2000);
    expect(s.clicking("left")).toBe(false);
    s.grab("left", 3, 2100); // a click does not arm another one
    expect(s.clicking("left")).toBe(false);
  });

  it("does not click after a long tap or a long gap", () => {
    const s = new StickFingers();
    s.grab("left", 1, 0);
    s.release(1, 300); // 300 ms tap
    s.grab("left", 2, 350);
    expect(s.clicking("left")).toBe(false);
    s.release(2, 400);
    s.grab("left", 3, 800); // 400 ms gap
    expect(s.clicking("left")).toBe(false);
  });
});

describe("EntryOrder", () => {
  it("returns the most recent keys still present", () => {
    const o = new EntryOrder<number>();
    o.track([1]);
    o.track([1, 2]);
    expect(o.last()).toBe(2);
    o.track([1]);
    expect(o.last()).toBe(1);
    o.track([1, 3, 4]);
    expect(o.recent(2)).toEqual([3, 4]);
  });
});
