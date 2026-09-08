export const TAU = Math.PI * 2
export const DEFAULT_LOOP_DURATION = TAU / 0.6

export function wrapAngle(angle: number): number {
  const wrapped = ((angle % TAU) + TAU) % TAU
  return Math.abs(wrapped) < 1e-10 || Math.abs(wrapped - TAU) < 1e-10 ? 0 : wrapped
}

export function rotationsPerCycle(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.max(1, Math.round(value / 50))
}

export function evaluateCoinMotion(timeSeconds: number, speed: number, ringSpeed: number, duration = DEFAULT_LOOP_DURATION) {
  const safeTime = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0)
  const safeDuration = Math.max(0.001, Number.isFinite(duration) ? duration : 3)
  const cyclePhase = safeTime / safeDuration
  return {
    tumble: wrapAngle(TAU * cyclePhase * rotationsPerCycle(speed)),
    ringPhase: wrapAngle(TAU * cyclePhase * rotationsPerCycle(ringSpeed)),
  }
}
