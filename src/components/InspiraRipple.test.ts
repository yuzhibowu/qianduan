import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSPIRA_RIPPLE,
  INSPIRA_RIPPLE_API,
  cssEaseInOut,
  rippleCircleStyle,
  rippleScaleAtTime,
} from "./InspiraRipple";

describe("Inspira UI Ripple adapter", () => {
  it("registers every official prop and its documented default", () => {
    expect(Object.keys(INSPIRA_RIPPLE_API)).toEqual([
      "baseCircleSize",
      "baseCircleOpacity",
      "circleOpacityDowngradeRatio",
      "waveSpeed",
      "spaceBetweenCircle",
      "numberOfCircles",
      "circleClass",
    ]);
    expect(INSPIRA_RIPPLE_API.baseCircleSize.default).toBe(210);
    expect(INSPIRA_RIPPLE_API.baseCircleOpacity.default).toBe(0.24);
    expect(INSPIRA_RIPPLE_API.spaceBetweenCircle.default).toBe(70);
    expect(INSPIRA_RIPPLE_API.circleOpacityDowngradeRatio.default).toBe(0.03);
    expect(INSPIRA_RIPPLE_API.circleClass.default).toBeUndefined();
    expect(INSPIRA_RIPPLE_API.waveSpeed.default).toBe(80);
    expect(INSPIRA_RIPPLE_API.numberOfCircles.default).toBe(7);
  });

  it("uses the official playground ranges and steps", () => {
    expect(INSPIRA_RIPPLE_API.baseCircleSize.officialRange).toEqual([80, 360]);
    expect(INSPIRA_RIPPLE_API.baseCircleOpacity).toMatchObject({ officialRange: [0.05, 0.8], step: 0.01 });
    expect(INSPIRA_RIPPLE_API.circleOpacityDowngradeRatio).toMatchObject({ officialRange: [0.01, 0.12], step: 0.01 });
    expect(INSPIRA_RIPPLE_API.waveSpeed).toMatchObject({ officialRange: [10, 240], step: 5 });
    expect(INSPIRA_RIPPLE_API.spaceBetweenCircle).toMatchObject({ officialRange: [20, 140], step: 5 });
    expect(INSPIRA_RIPPLE_API.numberOfCircles.officialRange).toEqual([2, 14]);
  });

  it("matches CSS ease-in-out and stays smooth across the loop seam", () => {
    expect(cssEaseInOut(0)).toBe(0);
    expect(cssEaseInOut(0.5)).toBeCloseTo(0.5, 8);
    expect(cssEaseInOut(1)).toBe(1);
    const before = rippleScaleAtTime(2 - 1 / 600, 80, 1);
    const seam = rippleScaleAtTime(0, 80, 1);
    const after = rippleScaleAtTime(1 / 600, 80, 1);
    const incomingStep = seam - before;
    const outgoingStep = after - seam;
    expect(Math.abs(incomingStep - outgoingStep)).toBeLessThan(0.000002);
    expect(Math.abs(incomingStep)).toBeGreaterThan(0);
  });

  it("preserves the official 1-based size, opacity, delay and dashed-ring formulas", () => {
    expect(rippleCircleStyle(DEFAULT_INSPIRA_RIPPLE, 1, 0)).toMatchObject({
      width: 280,
      height: 280,
      opacity: 0.21,
      animationDelay: "80ms",
      borderStyle: "solid",
    });
    expect(rippleCircleStyle(DEFAULT_INSPIRA_RIPPLE, 6, 0.5)).toMatchObject({
      width: 630,
      opacity: 0.06,
      animationDelay: "-20ms",
      borderStyle: "dashed",
    });
    expect(rippleCircleStyle(DEFAULT_INSPIRA_RIPPLE, 7, 0)).toMatchObject({
      width: 700,
      opacity: 0.03,
      animationDelay: "560ms",
      borderStyle: "solid",
    });
  });

  it("uses the official demo's theme-aware primary color by default", () => {
    expect(DEFAULT_INSPIRA_RIPPLE.circleColor).toBe("currentColor");
    expect(rippleCircleStyle(DEFAULT_INSPIRA_RIPPLE, 1, 0)).toMatchObject({
      borderColor: "#FFFFFF",
      background: "#FFFFFF40",
    });
    expect(rippleCircleStyle(DEFAULT_INSPIRA_RIPPLE, 1, 0, "#000000")).toMatchObject({
      borderColor: "#FFFFFF",
      background: "#FFFFFF40",
    });
    expect(rippleCircleStyle(DEFAULT_INSPIRA_RIPPLE, 1, 0, "#FFFFFF")).toMatchObject({
      borderColor: "#000000",
      background: "#00000040",
    });
  });
});
