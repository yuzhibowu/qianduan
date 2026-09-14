import { describe, expect, it } from "vitest";
import { alphaEdgeMaskPixels, alphaGroupEnvelopePixels, alphaIslandCount } from "./alpha-edge-mask";

function solid(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) pixels[index * 4 + 3] = 255;
  return pixels;
}

const alphaAt = (pixels: Uint8ClampedArray, width: number, x: number, y: number) =>
  pixels[(y * width + x) * 4 + 3];

describe("Euclidean Alpha edge mask", () => {
  it("keeps a fixed-width inner band on every straight side", () => {
    const width = 15;
    const mask = alphaEdgeMaskPixels(solid(width, 15), width, 15, 3);
    expect(alphaAt(mask, width, 0, 7)).toBe(255);
    expect(alphaAt(mask, width, 2, 7)).toBe(255);
    expect(alphaAt(mask, width, 3, 7)).toBe(0);
    expect(alphaAt(mask, width, 7, 0)).toBe(255);
    expect(alphaAt(mask, width, 7, 3)).toBe(0);
  });

  it("uses Euclidean rather than square-kernel distance around a corner", () => {
    const width = 21;
    const mask = alphaEdgeMaskPixels(solid(width, 21), width, 21, 3);
    expect(alphaAt(mask, width, 2, 2)).toBe(255);
    expect(alphaAt(mask, width, 3, 3)).toBe(0);
  });

  it("preserves the source continuous Alpha on the outside edge", () => {
    const pixels = solid(5, 5);
    pixels[2 * 4 + 3] = 128;
    const mask = alphaEdgeMaskPixels(pixels, 5, 5, 2);
    expect(alphaAt(mask, 5, 2, 0)).toBeGreaterThan(0);
    expect(alphaAt(mask, 5, 2, 0)).toBeLessThan(255);
  });

  it("wraps disconnected Alpha islands in one filled outer envelope", () => {
    const width = 20;
    const pixels = new Uint8ClampedArray(width * 10 * 4);
    for (let y = 2; y <= 7; y += 1) {
      for (let x = 1; x <= 4; x += 1) pixels[(y * width + x) * 4 + 3] = 255;
      for (let x = 15; x <= 18; x += 1) pixels[(y * width + x) * 4 + 3] = 255;
    }
    expect(alphaIslandCount(pixels, width, 10)).toBe(2);
    const envelope = alphaGroupEnvelopePixels(pixels, width, 10);
    expect(alphaIslandCount(envelope, width, 10)).toBe(1);
    expect(alphaAt(envelope, width, 10, 5)).toBe(255);
    expect(alphaAt(envelope, width, 0, 0)).toBe(0);
  });
});
