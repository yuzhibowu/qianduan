import { describe, expect, it } from "vitest";
import {
  alphaContourThreshold,
  alphaEdgeMaskPixels,
  alphaPositionedEdgeMaskPixels,
  alphaGroupEnvelopePixels,
  alphaIslandCount,
} from "./alpha-edge-mask";

function solid(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) pixels[index * 4 + 3] = 255;
  return pixels;
}

const alphaAt = (pixels: Uint8ClampedArray, width: number, x: number, y: number) =>
  pixels[(y * width + x) * 4 + 3];

describe("Euclidean Alpha edge mask", () => {
  it("places a stroke fully inside, equally across, or fully outside the Alpha contour", () => {
    const source = solid(9, 9);
    const inside = alphaPositionedEdgeMaskPixels(source, 9, 9, 2, "inside", 0);
    const center = alphaPositionedEdgeMaskPixels(source, 9, 9, 2, "center", 3);
    const outside = alphaPositionedEdgeMaskPixels(source, 9, 9, 2, "outside", 3);

    expect(alphaAt(inside.pixels, inside.width, 0, 4)).toBeGreaterThan(0);
    expect(alphaAt(inside.pixels, inside.width, 4, 4)).toBe(0);
    expect(alphaAt(center.pixels, center.width, 2, 7)).toBeGreaterThan(0);
    expect(alphaAt(center.pixels, center.width, 3, 7)).toBeGreaterThan(0);
    expect(alphaAt(outside.pixels, outside.width, 2, 7)).toBeGreaterThan(0);
    expect(alphaAt(outside.pixels, outside.width, 3, 7)).toBe(0);
  });

  it("recognizes a stable translucent panel as the background contour", () => {
    const width = 20;
    const height = 20;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) pixels[index * 4 + 3] = 83;
    for (let y = 7; y < 13; y += 1) {
      for (let x = 5; x < 15; x += 1) pixels[(y * width + x) * 4 + 3] = 255;
    }
    const threshold = alphaContourThreshold(pixels, width, height);
    expect(threshold).toBeLessThan(83);
    expect(alphaIslandCount(pixels, width, height, threshold)).toBe(1);
    expect(alphaAt(alphaEdgeMaskPixels(pixels, width, height, 2, threshold, true), width, 0, 10)).toBe(255);
  });

  it("does not promote a varied low-alpha shadow into the main contour", () => {
    const width = 20;
    const height = 20;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) pixels[index * 4 + 3] = 8 + (index % 96);
    for (let y = 7; y < 13; y += 1) {
      for (let x = 5; x < 15; x += 1) pixels[(y * width + x) * 4 + 3] = 255;
    }
    expect(alphaContourThreshold(pixels, width, height)).toBe(128);
  });

  it("ignores a dominant fully transparent margin when searching for a translucent body", () => {
    const width = 40;
    const height = 40;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 12; y < 28; y += 1) {
      for (let x = 10; x < 30; x += 1) pixels[(y * width + x) * 4 + 3] = 80;
    }
    expect(alphaContourThreshold(pixels, width, height)).toBeLessThan(80);
  });

  it("prefers the higher body plateau over a larger low-alpha shadow plateau", () => {
    const width = 40;
    const height = 40;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 4; y < 36; y += 1) {
      for (let x = 4; x < 36; x += 1) pixels[(y * width + x) * 4 + 3] = 22;
    }
    for (let y = 9; y < 31; y += 1) {
      for (let x = 8; x < 32; x += 1) pixels[(y * width + x) * 4 + 3] = 84;
    }
    expect(alphaContourThreshold(pixels, width, height)).toBeGreaterThan(70);
  });

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

  it("follows the top and bottom brush silhouette instead of a convex polygon", () => {
    const width = 21;
    const height = 14;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const block = (fromX: number, toX: number, fromY: number, toY: number) => {
      for (let y = fromY; y <= toY; y += 1) {
        for (let x = fromX; x <= toX; x += 1) pixels[(y * width + x) * 4 + 3] = 255;
      }
    };
    block(1, 4, 1, 8);
    block(8, 12, 6, 11);
    block(16, 19, 2, 9);

    const envelope = alphaGroupEnvelopePixels(pixels, width, height);

    expect(alphaAt(envelope, width, 10, 2)).toBe(0);
    expect(alphaAt(envelope, width, 10, 6)).toBe(255);
    expect(alphaAt(envelope, width, 6, 4)).toBeGreaterThan(0);
    expect(alphaIslandCount(envelope, width, height)).toBe(1);
  });

  it("keeps steep brush tips connected across adjacent columns", () => {
    const width = 12;
    const height = 20;
    const pixels = new Uint8ClampedArray(width * height * 4);
    const points = [[1, 2], [2, 8], [3, 14], [8, 4], [9, 10], [10, 16]];
    for (const [x, y] of points) pixels[(y * width + x) * 4 + 3] = 255;

    const envelope = alphaGroupEnvelopePixels(pixels, width, height);

    expect(alphaIslandCount(envelope, width, height)).toBe(1);
    expect(alphaAt(envelope, width, 2, 5)).toBe(255);
    expect(alphaAt(envelope, width, 6, 9)).toBe(255);
  });
});
