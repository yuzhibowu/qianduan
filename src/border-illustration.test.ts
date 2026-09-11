import { describe, expect, it } from "vitest";
import { displayIllustrationAspect, visibleAlphaBounds } from "./border-illustration";

describe("border illustration fitting", () => {
  it("uses the visible alpha rectangle instead of transparent padding", () => {
    const pixels = new Uint8ClampedArray(8 * 6 * 4);
    for (let y = 1; y <= 4; y += 1) for (let x = 2; x <= 6; x += 1) pixels[(y * 8 + x) * 4 + 3] = 255;
    expect(visibleAlphaBounds(pixels, 8, 6)).toEqual({ x: 2, y: 1, width: 5, height: 4 });
    expect(displayIllustrationAspect(5 / 4)).toBe("5:4");
  });

  it("ignores a soft semi-transparent shadow around the solid illustration", () => {
    const pixels = new Uint8ClampedArray(7 * 5 * 4);
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 7; x += 1) pixels[(y * 7 + x) * 4 + 3] = 200;
    for (let y = 1; y <= 3; y += 1) for (let x = 2; x <= 4; x += 1) pixels[(y * 7 + x) * 4 + 3] = 255;
    expect(visibleAlphaBounds(pixels, 7, 5)).toEqual({ x: 2, y: 1, width: 3, height: 3 });
  });

  it("shows familiar or simple approximate ratios instead of decimals", () => {
    expect(displayIllustrationAspect(16 / 9)).toBe("16:9");
    expect(displayIllustrationAspect(4.65)).toBe("≈14:3");
  });
});
