import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_ALPHA_THRESHOLD,
  adaptiveAlphaBounds,
  staticBorderAdaptiveCrop,
} from "./adaptive-bounds";

describe("adaptive export bounds", () => {
  it("ignores invisible Gaussian blur tails below the visual threshold", () => {
    const pixels = new Uint8ClampedArray(5 * 3 * 4);
    pixels[(1 * 5 + 0) * 4 + 3] = ADAPTIVE_ALPHA_THRESHOLD - 1;
    pixels[(1 * 5 + 1) * 4 + 3] = ADAPTIVE_ALPHA_THRESHOLD;
    pixels[(2 * 5 + 3) * 4 + 3] = 255;
    expect(adaptiveAlphaBounds(pixels, 5, 3)).toEqual({
      left: 1,
      top: 1,
      right: 3,
      bottom: 2,
    });
  });

  it("returns null for a visually empty frame", () => {
    expect(adaptiveAlphaBounds(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });

  it("solves a stationary border crop without scanning the animation", () => {
    const crop = staticBorderAdaptiveCrop({
      componentId: "pulsating-border",
      width: 1280,
      height: 720,
      distance: 20,
      borderAspect: 3,
      borderWidth: 3,
      borderWrapPosition: "inside",
      glow: 34,
    });
    expect(crop).not.toBeNull();
    expect(crop!.width).toBeLessThan(1280);
    expect(crop!.height).toBeLessThan(720);
    expect(crop!.width).toBeGreaterThan(900);
  });

  it("keeps full-cycle scanning for moving illustration content", () => {
    const base = {
      componentId: "neon-border",
      width: 1280,
      height: 720,
      distance: 20,
      borderAspect: 16 / 9,
      borderWidth: 3,
      borderWrapPosition: "inside" as const,
      glow: 50,
    };
    expect(staticBorderAdaptiveCrop({
      ...base,
      borderIllustration: { bounds: { x: 0, y: 0, width: 10, height: 10 }, animated: true },
    })).toBeNull();
    expect(staticBorderAdaptiveCrop({ ...base, borderOverlayIllustrations: [{}] })).toBeNull();
  });
});
