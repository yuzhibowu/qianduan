export type PixelBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Ignore mathematically non-zero blur tails that are no longer visually meaningful. */
export const ADAPTIVE_ALPHA_THRESHOLD = 8;
export const ADAPTIVE_SAFETY_PADDING = 4;

export function adaptiveAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minimumAlpha = ADAPTIVE_ALPHA_THRESHOLD,
): PixelBounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < minimumAlpha) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, right, bottom };
}
