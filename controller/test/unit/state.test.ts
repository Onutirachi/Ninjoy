import { describe, expect, it } from "vitest";
import { StateBuilder } from "../../src/engine/state.ts";

describe("controller state", () => {
  it("starts empty", () => {
    const state = new StateBuilder().publish(0);
    expect([...state.buttons]).toEqual([]);
    expect(state.sticks).toEqual({ left: { x: 0, y: 0 }, right: { x: 0, y: 0 } });
    expect(state.triggers).toEqual({ l2: 0, r2: 0 });
    expect(state.touchpad.touches).toEqual([]);
    expect(state.motion).toBeNull();
  });

  it("increments seq only when something changed", () => {
    const builder = new StateBuilder();
    const first = builder.publish(1);
    expect(builder.publish(2)).toBe(first); // nothing changed: same object, same seq
    builder.press("cross");
    const second = builder.publish(3);
    expect(second.seq).toBe(first.seq + 1);
    expect(second.time).toBe(3);
  });

  it("OR-s buttons and keeps the strongest trigger", () => {
    const builder = new StateBuilder();
    builder.press("l1");
    builder.press("l1");
    builder.trigger("l2", 0.3);
    builder.trigger("l2", 0.7);
    const state = builder.publish(0);
    expect([...state.buttons]).toEqual(["l1", "l2"]);
    expect(state.triggers.l2).toBe(0.7);
  });

  it("sets the digital L2/R2 buttons while the force is above zero", () => {
    const builder = new StateBuilder();
    builder.trigger("r2", 0);
    expect(builder.publish(0).buttons.has("r2")).toBe(false);
    builder.trigger("r2", 0.01);
    expect(builder.publish(1).buttons.has("r2")).toBe(true);
  });

  it("a button bound to L2 gives full force", () => {
    const builder = new StateBuilder();
    builder.press("l2");
    expect(builder.publish(0).triggers.l2).toBe(1);
  });

  it("publishes frozen objects", () => {
    const state = new StateBuilder().publish(0);
    expect(Object.isFrozen(state)).toBe(true);
  });
});
