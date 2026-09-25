import { describe, expect, it } from "vitest";
import { DEFAULT_COIN_FAN, evaluateCoinFan, fanAngle } from "./coin-fan";
import { TAU } from "./time";

const fan = { ...DEFAULT_COIN_FAN, enabled: true };

describe("Coin Loader fan opening", () => {
  it("starts as a deck, opens into a fan, runs the full orbit, then closes", () => {
    const start = evaluateCoinFan(0, 10, 50, fan);
    const spread = evaluateCoinFan(1.1, 10, 50, fan);
    const moving = evaluateCoinFan(1.55, 10, 50, fan);
    const flipping = evaluateCoinFan(1.8, 10, 50, fan);
    const orbitStart = evaluateCoinFan(2, 10, 50, fan);
    const orbitEnd = evaluateCoinFan(8, 10, 50, fan);
    const retracting = evaluateCoinFan(8.45, 10, 50, fan);
    const folding = evaluateCoinFan(9.45, 10, 50, fan);
    const end = evaluateCoinFan(10, 10, 50, fan);
    expect(start.fan).toBe(0);
    expect(start.orbit).toBe(0);
    expect(spread.fan).toBe(1);
    expect(spread.orbit).toBe(0);
    expect(spread.rotation).toBe(0);
    expect(spread.motionTime).toBe(0);
    expect(moving.orbit).toBeGreaterThan(0);
    expect(moving.orbit).toBeLessThan(1);
    expect(moving.orbit).toBeCloseTo(0.5);
    expect(moving.motionTime).toBe(0);
    expect(moving.rotation).toBeGreaterThan(0);
    expect(flipping.motionTime).toBeGreaterThan(0);
    expect(flipping.motionTime).toBeLessThan(orbitStart.motionTime);
    expect(orbitStart.orbit).toBe(1);
    expect(orbitStart.motionTime).toBeGreaterThan(flipping.motionTime);
    expect(orbitStart.rotation).toBeGreaterThan(moving.rotation);
    expect(orbitEnd.motionTime).toBeLessThan(10);
    expect(retracting.orbit).toBeLessThan(1);
    expect(retracting.fan).toBe(1);
    expect(retracting.rotation).toBeGreaterThan(orbitEnd.rotation);
    expect(retracting.orbit).toBeCloseTo(0.5);
    expect(retracting.motionTime).toBe(10);
    expect(folding.orbit).toBe(0);
    expect(folding.fan).toBeLessThan(1);
    expect(folding.rotation).toBeGreaterThan(retracting.rotation);
    expect(folding.motionTime).toBe(retracting.motionTime);
    expect(end.fan).toBe(0);
    expect(end.orbit).toBe(0);
    expect(end.rotation).toBeCloseTo(TAU);
    expect(end.motionTime).toBe(10);
  });

  it("eases the individual flips in after 75% radial expansion and out before cards overlap", () => {
    const beforeStart = evaluateCoinFan(1.70, 10, 50, fan);
    const justStarted = evaluateCoinFan(1.71, 10, 50, fan);
    const moving = evaluateCoinFan(1.85, 10, 50, fan);
    const beforeStop = evaluateCoinFan(8.29, 10, 50, fan);
    const stopped = evaluateCoinFan(8.30, 10, 50, fan);
    expect(beforeStart.motionTime).toBe(0);
    expect(beforeStart.orbit).toBeLessThan(0.75);
    expect(justStarted.motionTime).toBeGreaterThan(0);
    expect(justStarted.orbit).toBeGreaterThan(0.75);
    expect(justStarted.motionTime).toBeLessThan(moving.motionTime / 10);
    expect(beforeStop.motionTime).toBeLessThan(10);
    expect(beforeStop.orbit).toBeGreaterThan(0.75);
    expect(stopped.motionTime).toBe(10);
    expect(stopped.orbit).toBeLessThan(0.75);
    expect(stopped.rotation).toBeGreaterThan(beforeStop.rotation);
  });

  it("places all numbered cards once around a full 360-degree circle", () => {
    const angles = Array.from({ length: 8 }, (_, index) => fanAngle(index, 8));
    for (let index = 1; index < angles.length; index += 1)
      expect(angles[index] - angles[index - 1]).toBeCloseTo(TAU / 8);
    expect(angles[7] - angles[0]).toBeCloseTo(TAU * 7 / 8);
    expect(fanAngle(0, 8)).toBeCloseTo(TAU / 8);
    expect(fanAngle(7, 8)).toBeCloseTo(TAU);
  });

  it("leaves the original motion selected by default", () => {
    expect(DEFAULT_COIN_FAN.enabled).toBe(false);
  });
});
