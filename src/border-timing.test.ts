import { describe, expect, it } from "vitest";
import { borderLoopDuration, neonLoopDuration, neonSegmentDuration } from "./border-timing";

describe("border animation timing", () => {
  it("keeps the registered Neon default at one complete four-corner cycle", () => {
    expect(neonLoopDuration(16)).toBeCloseTo(9.474, 3);
    expect(neonLoopDuration(16)).toBeCloseTo(neonSegmentDuration(16) * 4, 10);
  });

  it("updates the complete Neon cycle with its speed", () => {
    expect(neonLoopDuration(1)).toBe(30);
    expect(neonLoopDuration(20)).toBe(4);
  });

  it("updates the other border component cycles from the same speed semantics", () => {
    expect(borderLoopDuration("glow-border", 10)).toBe(10);
    expect(borderLoopDuration("glow-border", 20)).toBe(5);
    expect(borderLoopDuration("pulsating-border", 1)).toBe(10);
    expect(borderLoopDuration("pulsating-border", 2)).toBe(5);
  });
});
