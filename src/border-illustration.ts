export type IllustrationBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BorderIllustration = {
  src: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
  bounds: IllustrationBounds;
  aspect: number;
  rounded: number;
};

declare global {
  interface Window {
    __originKitBorderIllustrations?: Record<string, BorderIllustration>;
  }
}

export function visibleAlphaBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 240,
): IllustrationBounds {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < alphaThreshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left || bottom < top
    ? { x: 0, y: 0, width, height }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

export function alphaRoundedPercent(
  data: Uint8ClampedArray,
  imageWidth: number,
  bounds: IllustrationBounds,
) {
  const opaque = (x: number, y: number) => data[(y * imageWidth + x) * 4 + 3] >= 240;
  const { x, y, width, height } = bounds;
  const right = x + width - 1;
  const bottom = y + height - 1;
  let topInset = 0;
  while (topInset < width / 2 && !opaque(x + topInset, y)) topInset += 1;
  let bottomInset = 0;
  while (bottomInset < width / 2 && !opaque(x + bottomInset, bottom)) bottomInset += 1;
  let leftInset = 0;
  while (leftInset < height / 2 && !opaque(x, y + leftInset)) leftInset += 1;
  let rightInset = 0;
  while (rightInset < height / 2 && !opaque(right, y + rightInset)) rightInset += 1;
  const radius = (topInset + bottomInset + leftInset + rightInset) / 4;
  if (radius <= 1) return 0;
  return Math.min(100, (radius / (Math.min(width, height) / 2)) * 100);
}

export function displayIllustrationAspect(aspect: number) {
  if (!Number.isFinite(aspect) || aspect <= 0) return "—";
  const common: Array<[number, number]> = [
    [1, 3], [1, 2], [9, 16], [2, 3], [3, 4], [1, 1],
    [5, 4], [4, 3], [3, 2], [16, 9], [2, 1], [3, 1],
  ];
  const known = common.find(([wide, tall]) => Math.abs(wide / tall - aspect) <= 0.015);
  if (known) return `${known[0]}:${known[1]}`;
  let best = { wide: Math.max(1, Math.round(aspect)), tall: 1, error: Number.POSITIVE_INFINITY, score: Number.POSITIVE_INFINITY };
  for (let tall = 1; tall <= 12; tall += 1) {
    const wide = Math.max(1, Math.round(aspect * tall));
    const error = Math.abs(wide / tall - aspect);
    const score = error + tall * 0.01;
    if (error <= 0.1 && score < best.score) best = { wide, tall, error, score };
  }
  return `${best.error <= 0.001 ? "" : "≈"}${best.wide}:${best.tall}`;
}
