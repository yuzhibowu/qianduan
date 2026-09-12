export type NeonAdaptation = {
  borderWidth: number;
  neonLength: number;
};

export const NEON_BASE_ASPECT = 16 / 9;
export const NEON_BASE_BORDER_WIDTH = 6;
export const NEON_BASE_LENGTH = 50;

const CALIBRATED_ASPECT = 7.4;
const BORDER_EXPONENT = Math.log(NEON_BASE_BORDER_WIDTH / 3) /
  Math.log(CALIBRATED_ASPECT / NEON_BASE_ASPECT);
const LENGTH_EXPONENT = Math.log(NEON_BASE_LENGTH / 23) /
  Math.log(CALIBRATED_ASPECT / NEON_BASE_ASPECT);

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Uses the visible PNG shape, not its transparent canvas, and treats portrait/landscape equally. */
export function adaptNeonToAspect(aspect: number): NeonAdaptation {
  if (!Number.isFinite(aspect) || aspect <= 0) {
    return { borderWidth: NEON_BASE_BORDER_WIDTH, neonLength: NEON_BASE_LENGTH };
  }
  const elongation = Math.max(aspect, 1 / aspect);
  if (elongation <= NEON_BASE_ASPECT) {
    return { borderWidth: NEON_BASE_BORDER_WIDTH, neonLength: NEON_BASE_LENGTH };
  }
  const ratio = elongation / NEON_BASE_ASPECT;
  return {
    borderWidth: clamp(Math.round(NEON_BASE_BORDER_WIDTH * ratio ** -BORDER_EXPONENT), 1, 10),
    neonLength: clamp(Math.round(NEON_BASE_LENGTH * ratio ** -LENGTH_EXPONENT), 1, 100),
  };
}
