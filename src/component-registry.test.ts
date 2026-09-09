import { describe, expect, it } from "vitest"
import { componentRegistry, getMotionComponent } from "./component-registry"

describe("motion component registry", () => {
  it("registers Coin Loader with its real export capabilities", () => {
    const component = getMotionComponent("coin-loader")
    expect(component.name).toBe("Coin Loader")
    expect(component.source).toBe("OriginKit")
    expect(component.triggerMode).toBe("auto")
    expect(component.exportCapabilities).toEqual(["mov", "apng", "usdz"])
  })

  it("falls back safely when an unknown component id is requested", () => {
    expect(getMotionComponent("missing")).toBe(componentRegistry[0])
  })

  it("collects the last three OriginKit border examples without claiming USDZ support", () => {
    const borders = ["glow-border", "neon-border", "pulsating-border"].map(getMotionComponent)
    expect(borders.map((component) => component.name)).toEqual(["Glow Border", "Neon Border", "Pulsating Border"])
    expect(borders.every((component) => component.exportCapabilities.includes("mov"))).toBe(true)
    expect(borders.every((component) => component.exportCapabilities.includes("apng"))).toBe(true)
    expect(borders.every((component) => !component.exportCapabilities.includes("usdz"))).toBe(true)
  })
})
