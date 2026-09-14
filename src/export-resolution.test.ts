import { describe, expect, it } from "vitest";
import {
  dimensionsForExportPreset,
  presetForExportDimensions,
} from "./export-resolution";

describe("export resolution and aspect", () => {
  it("applies aspect after selecting a 16:9 resolution mother canvas", () => {
    expect(dimensionsForExportPreset("2k", "16:9")).toEqual({ width: 2560, height: 1440 });
    expect(dimensionsForExportPreset("2k", "adaptive")).toEqual({ width: 2560, height: 1440 });
    expect(dimensionsForExportPreset("2k", "1:1")).toEqual({ width: 1440, height: 1440 });
  });

  it("keeps the resolution preset selected for its square short-edge output", () => {
    expect(presetForExportDimensions(1440, 1440)).toBe("2k");
    expect(presetForExportDimensions(2560, 1440)).toBe("2k");
    expect(presetForExportDimensions(1500, 1500)).toBeNull();
  });
});
