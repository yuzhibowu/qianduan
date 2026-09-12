import { describe, expect, it } from "vitest";
import { ADAPTIVE_ALPHA_THRESHOLD, adaptiveAlphaBounds } from "./adaptive-bounds";

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
});
