import { TAU, rotationsPerCycle } from "./time";

export type CoinFanSettings = {
  enabled: boolean;
  opening: number;
  closing: number;
};

export const DEFAULT_COIN_FAN: CoinFanSettings = {
  enabled: false,
  opening: 20,
  closing: 20,
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const easedFlipProgress = (value: number) => {
  const t = clamp01(value);
  const ramp = 0.12;
  const scale = 1 / (1 - ramp);
  if (t < ramp) return t * t * scale / (2 * ramp);
  if (t > 1 - ramp) return 1 - (1 - t) * (1 - t) * scale / (2 * ramp);
  return (t - ramp / 2) * scale;
};

/** Shared-corner hinge opening, moving/rotating orbit, then reverse closing while rotation continues. */
export function evaluateCoinFan(time: number, duration: number, ringSpeed: number, settings: CoinFanSettings) {
  const cycle = clamp01(Math.max(0, time) / Math.max(0.001, duration));
  const opening = Math.max(0.05, Math.min(0.4, settings.opening / 100));
  const closing = Math.max(0.05, Math.min(0.4, settings.closing / 100));
  const laps = rotationsPerCycle(ringSpeed);
  // The ring may rotate throughout dispersion and closure. Individual cards
  // only flip once they have completed 75% of their eased radial travel.
  const motionStart = opening * 0.55;
  const motionProgress = clamp01((cycle - motionStart) / (1 - motionStart));
  const rotation = TAU * laps * motionProgress;
  const radialTimeAt75Percent = 0.6736481776669303; // smooth(t) = 0.75
  const flipStart = opening * (0.55 + 0.45 * radialTimeAt75Percent);
  const flipEnd = 1 - closing + closing * 0.45 * (1 - radialTimeAt75Percent);
  const motionTime = duration * easedFlipProgress((cycle - flipStart) / (flipEnd - flipStart));
  if (cycle < opening) {
    const local = cycle / opening;
    return {
      fan: smooth(Math.min(1, local / 0.55)),
      orbit: smooth((local - 0.55) / 0.45),
      rotation,
      motionTime,
      stage: "opening" as const,
    };
  }
  if (cycle < 1 - closing) {
    return { fan: 1, orbit: 1, rotation, motionTime, stage: "orbit" as const };
  }
  const local = (cycle - (1 - closing)) / closing;
  return {
    fan: 1 - smooth((local - 0.45) / 0.55),
    orbit: 1 - smooth(local / 0.45),
    rotation,
    motionTime,
    stage: "closing" as const,
  };
}

export function fanAngle(index: number, count: number) {
  return ((index + 1) / Math.max(1, count)) * TAU;
}
