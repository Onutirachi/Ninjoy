import { describe, expect, it } from "vitest";
import { toControllerFrame } from "../../src/engine/motion.ts";
import { StateBuilder } from "../../src/engine/state.ts";

const v = { x: 1, y: 2, z: 3 };

describe("toControllerFrame", () => {
  it("rotates x/y by the screen orientation and keeps z", () => {
    expect(toControllerFrame(v, v, 0).rate).toEqual({ x: 1, y: 2, z: 3 });
    expect(toControllerFrame(v, v, 90).rate).toEqual({ x: 2, y: -1, z: 3 });
    expect(toControllerFrame(v, v, 270).accel).toEqual({ x: -2, y: 1, z: 3 });
    expect(toControllerFrame(v, v, -90).accel).toEqual({ x: -2, y: 1, z: 3 });
    expect(toControllerFrame(v, v, 180).rate).toEqual({ x: -1, y: -2, z: 3 });
  });
});

describe("motion in the state", () => {
  it("is null while gyro is off", () => {
    const b = new StateBuilder();
    b.setMotion({ rate: v, accel: v, time: 1 });
    expect(b.publish(1).motion).toBeNull();
    b.setGyro(true);
    b.setMotion({ rate: v, accel: v, time: 2 });
    expect(b.publish(2).motion?.rate).toEqual(v);
    b.setGyro(false);
    expect(b.publish(3)).toMatchObject({ gyro: false, motion: null });
  });
});
