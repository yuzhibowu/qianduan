const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function neonSegmentDuration(speed: number) {
  const safeSpeed = clamp(Number.isFinite(speed) ? speed : 16, 1, 20);
  return (30 + ((4 - 30) * (safeSpeed - 1)) / 19) / 4;
}

export function neonLoopDuration(speed: number) {
  return neonSegmentDuration(speed) * 4;
}

export function borderLoopDuration(componentId: string, speed: number) {
  if (componentId === "neon-border") return neonLoopDuration(speed);
  if (componentId === "glow-border") {
    const safeSpeed = clamp(Number.isFinite(speed) ? speed : 10, 0, 100);
    return safeSpeed > 0 ? 100 / safeSpeed : 10;
  }
  if (componentId === "pulsating-border") {
    const safeSpeed = clamp(Number.isFinite(speed) ? speed : 1, 1, 10);
    return 10 / safeSpeed;
  }
  return undefined;
}
