import { describe, expect, it } from "vitest";
import { componentRegistry, getMotionComponent } from "./component-registry";
import { PAPER_IMAGE_LOOP_DURATION } from "./components/PaperImageRenderer";

describe("motion component registry", () => {
  it("registers Coin Loader with its real export capabilities", () => {
    const component = getMotionComponent("coin-loader");
    expect(component.name).toBe("Coin Loader");
    expect(component.source).toBe("OriginKit");
    expect(component.triggerMode).toBe("auto");
    expect(component.exportCapabilities).toEqual(["mov", "apng", "usdz"]);
  });

  it("falls back safely when an unknown component id is requested", () => {
    expect(getMotionComponent("missing")).toBe(componentRegistry[0]);
  });

  it("registers Disc Split as a deterministic 3D component with USDZ export", () => {
    const component = getMotionComponent("disc-split");
    expect(component.name).toBe("Disc Split");
    expect(component.category).toBe("3D");
    expect(component.exportCapabilities).toEqual(["mov", "apng", "usdz"]);
  });

  it("groups the first automatic expansion batch by its motion type", () => {
    expect(getMotionComponent("gyro-loader").category).toBe("3D");
    expect(getMotionComponent("gyro-loader").exportCapabilities).toEqual([
      "mov",
      "apng",
      "usdz",
    ]);
    expect(getMotionComponent("typewriter").category).toBe("Text");
    expect(getMotionComponent("shiny-pill").category).toBe("Text");
    expect(getMotionComponent("typewriter").exportCapabilities).toEqual([
      "mov",
      "apng",
    ]);
  });

  it("collects the last three OriginKit border examples without claiming USDZ support", () => {
    const borders = ["glow-border", "neon-border", "pulsating-border"].map(
      getMotionComponent,
    );
    expect(borders.map((component) => component.name)).toEqual([
      "Glow Border",
      "Neon Border",
      "Pulsating Border",
    ]);
    expect(
      borders.every((component) =>
        component.exportCapabilities.includes("mov"),
      ),
    ).toBe(true);
    expect(
      borders.every((component) =>
        component.exportCapabilities.includes("apng"),
      ),
    ).toBe(true);
    expect(
      borders.every(
        (component) => !component.exportCapabilities.includes("usdz"),
      ),
    ).toBe(true);
  });

  it("exports Frosted Type Band as an animated USDZ text ring", () => {
    expect(getMotionComponent("frosted-type-band").exportCapabilities).toEqual([
      "mov",
      "apng",
      "usdz",
    ]);
  });

  it("registers official Paper Image as an interactive image effect", () => {
    const component = getMotionComponent("paper-image");
    expect(component.category).toBe("Image");
    expect(component.triggerMode).toBe("pointer");
    expect(component.exportCapabilities).toEqual(["mov", "apng"]);
    expect(PAPER_IMAGE_LOOP_DURATION).toBeCloseTo(6.283185, 5);
  });

  it("registers Inspira UI Ripple with web export capabilities", () => {
    const component = getMotionComponent("inspira-ripple");
    expect(component.source).toBe("Inspira UI");
    expect(component.category).toBe("Background");
    expect(component.triggerMode).toBe("auto");
    expect(component.exportCapabilities).toEqual(["mov", "apng"]);
    expect(component.usesOwnCanvasBackground).not.toBe(true);
    expect(getMotionComponent("light-bloom").usesOwnCanvasBackground).toBe(true);
  });
});
