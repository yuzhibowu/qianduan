export type DiscCurvePreset = "ease-out" | "linear" | "ease-in" | "ease-in-out" | "custom";

export type DiscCurveSettings = {
  preset: DiscCurvePreset;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export const DEFAULT_DISC_CURVE: DiscCurveSettings = {
  preset: "ease-out",
  x1: 0.3,
  y1: 0.3,
  x2: 0.58,
  y2: 1,
};

function coordinate(t: number, a: number, b: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * a + 3 * inverse * t * t * b + t * t * t;
}

function cubicBezier(progress: number, x1: number, y1: number, x2: number, y2: number) {
  const x = Math.min(1, Math.max(0, progress));
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    if (coordinate(middle, x1, x2) < x) low = middle;
    else high = middle;
  }
  return coordinate((low + high) / 2, y1, y2);
}

export function evaluateDiscCurve(progress: number, curve: DiscCurveSettings) {
  const value = Math.min(1, Math.max(0, progress));
  switch (curve.preset) {
    case "linear": return value;
    case "ease-in": return cubicBezier(value, 0.42, 0, 0.7, 0.7);
    case "ease-in-out": return cubicBezier(value, 0.42, 0, 0.58, 1);
    case "custom": return cubicBezier(value, curve.x1, curve.y1, curve.x2, curve.y2);
    case "ease-out":
    default: return cubicBezier(value, 0.3, 0.3, 0.58, 1);
  }
}
