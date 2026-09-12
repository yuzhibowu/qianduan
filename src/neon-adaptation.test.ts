import { describe, expect, it } from "vitest";
import { adaptNeonToAspect } from "./neon-adaptation";

describe("Neon illustration adaptation", () => {
  it("preserves the confirmed defaults for ordinary ratios", () => {
    expect(adaptNeonToAspect(16 / 9)).toEqual({ borderWidth: 6, neonLength: 50 });
    expect(adaptNeonToAspect(4 / 3)).toEqual({ borderWidth: 6, neonLength: 50 });
    expect(adaptNeonToAspect(1)).toEqual({ borderWidth: 6, neonLength: 50 });
  });

  it("reproduces the confirmed comfortable values at 7.4 to 1", () => {
    expect(adaptNeonToAspect(7.4)).toEqual({ borderWidth: 3, neonLength: 23 });
  });

  it("uses the same adaptation for portrait and landscape strips", () => {
    expect(adaptNeonToAspect(1 / 7.4)).toEqual(adaptNeonToAspect(7.4));
  });
});
