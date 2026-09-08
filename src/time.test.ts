import { describe, expect, it } from "vitest"
import { evaluateCoinMotion } from "./time"

describe("Coin Loader absolute-time evaluation", () => {
  it("returns the same pose for the same absolute time", () => {
    expect(evaluateCoinMotion(1.25, 100, 50)).toEqual(evaluateCoinMotion(1.25, 100, 50))
  })

  it("can seek backward without depending on a previous frame", () => {
    const before = evaluateCoinMotion(0.5, 100, 50)
    evaluateCoinMotion(2.5, 100, 50)
    expect(evaluateCoinMotion(0.5, 100, 50)).toEqual(before)
  })

  it("clamps negative time to the initial pose", () => {
    expect(evaluateCoinMotion(-1, 100, 50)).toEqual({ tumble: 0, ringPhase: 0 })
  })

  it("returns exactly to the initial pose at the end of a loop", () => {
    expect(evaluateCoinMotion(3, 100, 50, 3)).toEqual({ tumble: 0, ringPhase: 0 })
  })

  it("uses two coin tumbles and one ring turn for the default controls", () => {
    const halfway = evaluateCoinMotion(0.75, 100, 50, 3)
    expect(halfway.tumble).toBeCloseTo(Math.PI)
    expect(halfway.ringPhase).toBeCloseTo(Math.PI / 2)
  })

  it("preserves the original perceived angular speed at the default full-loop duration", () => {
    const pose = evaluateCoinMotion(1, 100, 50)
    expect(pose.tumble).toBeCloseTo(1.2)
    expect(pose.ringPhase).toBeCloseTo(0.6)
  })

  it("keeps the USDZ loop seam to exactly one normal frame step", () => {
    const fps = 60
    const duration = 3
    const frameCount = fps * duration
    const last = evaluateCoinMotion((frameCount - 1) / fps, 100, 50, duration)
    const first = evaluateCoinMotion(0, 100, 50, duration)
    expect(((first.tumble - last.tumble) + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo(Math.PI * 2 * 2 / frameCount)
    expect(((first.ringPhase - last.ringPhase) + Math.PI * 2) % (Math.PI * 2)).toBeCloseTo(Math.PI * 2 / frameCount)
  })
})
