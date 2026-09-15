import { describe, expect, it } from "vitest";
import { displayIllustrationAspect, pngHasAnimation, visibleAlphaBounds } from "./border-illustration";
import { alphaContourThreshold } from "./alpha-edge-mask";

describe("border illustration fitting", () => {
  it("uses the visible alpha rectangle instead of transparent padding", () => {
    const pixels = new Uint8ClampedArray(8 * 6 * 4);
    for (let y = 1; y <= 4; y += 1) for (let x = 2; x <= 6; x += 1) pixels[(y * 8 + x) * 4 + 3] = 255;
    expect(visibleAlphaBounds(pixels, 8, 6)).toEqual({ x: 2, y: 1, width: 5, height: 4 });
    expect(displayIllustrationAspect(5 / 4)).toBe("5:4");
  });

  it("ignores a soft semi-transparent shadow around the solid illustration", () => {
    const pixels = new Uint8ClampedArray(7 * 5 * 4);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 7; x += 1) pixels[(y * 7 + x) * 4 + 3] = 80 + ((x * 19 + y * 23) % 140);
    }
    for (let y = 1; y <= 3; y += 1) for (let x = 2; x <= 4; x += 1) pixels[(y * 7 + x) * 4 + 3] = 255;
    expect(visibleAlphaBounds(pixels, 7, 5)).toEqual({ x: 2, y: 1, width: 3, height: 3 });
  });

  it("fits a stable translucent panel instead of cropping to its opaque text", () => {
    const width = 20;
    const height = 16;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 1; y < 15; y += 1) {
      for (let x = 2; x < 18; x += 1) pixels[(y * width + x) * 4 + 3] = 83;
    }
    for (let y = 6; y < 10; y += 1) {
      for (let x = 7; x < 13; x += 1) pixels[(y * width + x) * 4 + 3] = 255;
    }
    const threshold = alphaContourThreshold(pixels, width, height, 240);
    expect(visibleAlphaBounds(pixels, width, height, threshold)).toEqual({ x: 2, y: 1, width: 16, height: 14 });
  });

  it("shows familiar or simple approximate ratios instead of decimals", () => {
    expect(displayIllustrationAspect(16 / 9)).toBe("16:9");
    expect(displayIllustrationAspect(4.65)).toBe("≈14:3");
  });

  it("recognizes the APNG animation control chunk", () => {
    const chunk = (type: string) => {
      const bytes = new Uint8Array(20);
      type.split("").forEach((letter, index) => { bytes[12 + index] = letter.charCodeAt(0); });
      return bytes;
    };
    expect(pngHasAnimation(chunk("acTL"))).toBe(true);
    expect(pngHasAnimation(chunk("IEND"))).toBe(false);
  });
});
