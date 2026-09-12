import { describe, expect, it } from "vitest";
import { alphaOutlinePath, angleAtPerimeterPhase, perimeterAngleLut } from "./alpha-perimeter";

function pixelsFor(width: number, height: number, inside: (x: number, y: number) => boolean = () => true) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inside(x, y)) pixels[(y * width + x) * 4 + 3] = 255;
    }
  }
  return pixels;
}

describe("alpha rect perimeter", () => {
  it("keeps a true square rectangle made only of straight segments", () => {
    const path = alphaOutlinePath(pixelsFor(100, 20), 100, 20);
    expect(path).not.toContain(" Q ");
  });

  it("creates a closed local curve without cubic-control overshoot", () => {
    const width = 100;
    const height = 60;
    const radius = 20;
    const rounded = pixelsFor(width, height, (x, y) => {
      const nearestX = Math.max(radius, Math.min(width - 1 - radius, x));
      const nearestY = Math.max(radius, Math.min(height - 1 - radius, y));
      return Math.hypot(x - nearestX, y - nearestY) <= radius;
    });
    const path = alphaOutlinePath(rounded, width, height);
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ Z$/);
    expect(path).not.toContain(" C ");
    expect(path).toContain(" Q ");
  });

  it("keeps opposite positions half a real perimeter apart", () => {
    const angles = perimeterAngleLut(pixelsFor(100, 20), 100, 20, 128, 360);
    expect(angles).toHaveLength(360);
    const first = angleAtPerimeterPhase(angles, 0);
    const opposite = angleAtPerimeterPhase(angles, 0.5);
    const difference = ((opposite - first + 540) % 360) - 180;
    expect(Math.abs(difference)).toBeCloseTo(180, 0);
  });

  it("wraps phase without introducing an angular jump", () => {
    const angles = perimeterAngleLut(pixelsFor(100, 20), 100, 20, 128, 360);
    const left = angleAtPerimeterPhase(angles, -0.001);
    const right = angleAtPerimeterPhase(angles, 0.999);
    expect(Math.abs(left - right)).toBeLessThan(0.1);
  });
});
