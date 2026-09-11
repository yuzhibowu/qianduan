import { describe, expect, it } from "vitest";
import { DEFAULT_DISC_CURVE, evaluateDiscCurve } from "./disc-curve";

describe("Disc Split animation curves", () => {
  it("uses the C-style ease-out preset", () => {
    expect(evaluateDiscCurve(0.5, DEFAULT_DISC_CURVE)).toBeGreaterThan(0.5);
    expect(evaluateDiscCurve(0.5, DEFAULT_DISC_CURVE)).toBeLessThan(1);
  });

  it("evaluates linear and custom curves from absolute progress", () => {
    expect(evaluateDiscCurve(0.37, { ...DEFAULT_DISC_CURVE, preset: "linear" })).toBeCloseTo(0.37, 8);
    expect(evaluateDiscCurve(0, { ...DEFAULT_DISC_CURVE, preset: "custom" })).toBeCloseTo(0, 6);
    expect(evaluateDiscCurve(1, { ...DEFAULT_DISC_CURVE, preset: "custom" })).toBeCloseTo(1, 6);
  });
});
