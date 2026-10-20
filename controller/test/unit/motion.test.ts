import { describe, expect, it } from "vitest";
import { toControllerFrame } from "../../src/engine/motion.ts";
import { StateBuilder } from "../../src/engine/state.ts";
import { deviceRate } from "../../src/platform/motion.ts";

const v = { x: 1, y: 2, z: 3 };

describe("toControllerFrame", () => {
  it("rotates x/y by the screen orientation and keeps z", () => {
    expect(toControllerFrame(v, v, 0).rate).toEqual({ x: 1, y: 2, z: 3 });
    expect(toControllerFrame(v, v, 90).rate).toEqual({ x: -2, y: 1, z: 3 });
    expect(toControllerFrame(v, v, 270).accel).toEqual({ x: 2, y: -1, z: 3 });
    expect(toControllerFrame(v, v, -90).accel).toEqual({ x: 2, y: -1, z: 3 });
    expect(toControllerFrame(v, v, 180).rate).toEqual({ x: -1, y: -2, z: 3 });
  });

  // measured on a phone held sideways (angle 90), upright, screen toward the player
  it("puts gravity up the screen and each turn on its screen axis", () => {
    const still = toControllerFrame({ x: 0, y: 0, z: 0 }, { x: 9.8, y: 0, z: 0.5 }, 90);
    expect(still.accel).toEqual({ x: 0, y: 9.8, z: 0.5 });
    const turn = (alpha: number, beta: number, gamma: number) => toControllerFrame(deviceRate({ alpha, beta, gamma }), v, 90).rate;
    // like a door (around the vertical axis): alpha, around the device's x
    expect(turn(90, 0, 0)).toMatchObject({ x: 0, y: 90, z: 0 });
    // tilting the top away (around the screen's horizontal axis): beta, around the device's y
    expect(turn(0, 90, 0)).toMatchObject({ x: -90, y: 0, z: 0 });
    // like a steering wheel (around the axis out of the screen): gamma
    expect(turn(0, 0, 90)).toMatchObject({ x: 0, y: 0, z: 90 });
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
