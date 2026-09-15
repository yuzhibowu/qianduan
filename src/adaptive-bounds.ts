export type PixelBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Ignore mathematically non-zero blur tails that are no longer visually meaningful. */
export const ADAPTIVE_ALPHA_THRESHOLD = 8;
export const ADAPTIVE_SAFETY_PADDING = 4;

type StaticBorderCropInput = {
  componentId: string;
  width: number;
  height: number;
  distance: number;
  borderAspect: number;
  borderWidth: number;
  borderWrapPosition: "inside" | "center" | "outside";
  glow: number;
  borderIllustration?: {
    bounds: { x: number; y: number; width: number; height: number };
    visualBounds?: { x: number; y: number; width: number; height: number };
    animated?: boolean;
  };
  borderOverlayIllustrations?: unknown[];
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/** Solve the full-cycle bounds of a stationary border contour geometrically. */
export function staticBorderAdaptiveCrop(input: StaticBorderCropInput) {
  if (
    !["glow-border", "neon-border", "pulsating-border"].includes(input.componentId) ||
    input.borderIllustration?.animated ||
    (input.borderOverlayIllustrations?.length ?? 0) > 0
  ) return null;

  const canvasAspect = input.width / Math.max(1, input.height);
  const aspect = Math.max(0.01, input.borderAspect);
  const panelWidth = Math.min(
    input.width * 0.72,
    input.width * 0.72 * aspect / canvasAspect,
  );
  const panelHeight = panelWidth / aspect;
  const scale = 20 / clamp(input.distance, 0.5, 80);
  const glowAmount = clamp(input.glow, 0, 100) / 100;

  let maximumStroke = input.borderWidth;
  let blurReach = 0;
  if (input.componentId === "neon-border" && glowAmount > 0) {
    maximumStroke += glowAmount * 36;
    blurReach = 57 * 3;
  } else if (input.componentId === "pulsating-border" && glowAmount > 0) {
    // Three reserved radii plus the remaining perceptible Gaussian tail.
    blurReach = glowAmount * 20 * 6;
  }
  const wrapReach = input.borderWrapPosition === "outside"
    ? maximumStroke
    : input.borderWrapPosition === "center"
      ? maximumStroke / 2
      : 0;
  const effectReach = wrapReach + blurReach;

  let localLeft = -effectReach;
  let localTop = -effectReach;
  let localRight = panelWidth + effectReach;
  let localBottom = panelHeight + effectReach;
  const illustration = input.borderIllustration;
  if (illustration?.visualBounds) {
    const body = illustration.bounds;
    const visible = illustration.visualBounds;
    const xScale = panelWidth / Math.max(1, body.width);
    const yScale = panelHeight / Math.max(1, body.height);
    localLeft = Math.min(localLeft, (visible.x - body.x) * xScale);
    localTop = Math.min(localTop, (visible.y - body.y) * yScale);
    localRight = Math.max(localRight, (visible.x + visible.width - body.x) * xScale);
    localBottom = Math.max(localBottom, (visible.y + visible.height - body.y) * yScale);
  }

  const centerX = input.width / 2;
  const centerY = input.height / 2;
  const left = Math.max(0, Math.floor(centerX + (localLeft - panelWidth / 2) * scale) - ADAPTIVE_SAFETY_PADDING);
  const top = Math.max(0, Math.floor(centerY + (localTop - panelHeight / 2) * scale) - ADAPTIVE_SAFETY_PADDING);
  const right = Math.min(input.width - 1, Math.ceil(centerX + (localRight - panelWidth / 2) * scale) + ADAPTIVE_SAFETY_PADDING);
  const bottom = Math.min(input.height - 1, Math.ceil(centerY + (localBottom - panelHeight / 2) * scale) + ADAPTIVE_SAFETY_PADDING);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

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
