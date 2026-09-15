const INF = 1e20;

export type BorderWrapPosition = "inside" | "center" | "outside";

/**
 * A translucent panel can be the intended outer body even when its Alpha is
 * below the normal 50% contour cut-off. Detect a stable, dominant Alpha
 * plateau, while ignoring the spread-out low values produced by shadows and
 * glows, and lower the geometry threshold only for that case.
 */
export function alphaContourThreshold(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  defaultThreshold = 128,
) {
  const histogram = new Uint32Array(256);
  let nonTransparent = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index];
    if (alpha === 0) continue;
    histogram[alpha] += 1;
    nonTransparent += 1;
  }
  if (nonTransparent === 0) return defaultThreshold;

  let peakPixels = 0;
  for (let alpha = 8; alpha < defaultThreshold; alpha += 1) {
    peakPixels = Math.max(peakPixels, histogram[alpha]);
  }
  const totalPixels = Math.max(1, width * height);
  const minimumPlateau = Math.max(64, totalPixels * 0.02);
  let plateauAlpha = 0;
  for (let alpha = defaultThreshold - 1; alpha >= 8; alpha -= 1) {
    const count = histogram[alpha];
    if (
      count >= minimumPlateau &&
      count / nonTransparent >= 0.1 &&
      count >= peakPixels * 0.2
    ) {
      plateauAlpha = alpha;
      break;
    }
  }
  if (plateauAlpha === 0) return defaultThreshold;

  return Math.max(2, plateauAlpha - Math.max(2, Math.round(plateauAlpha * 0.05)));
}

function distanceTransform1D(values: Float64Array) {
  const length = values.length;
  const sites = new Int32Array(length);
  const boundaries = new Float64Array(length + 1);
  const output = new Float64Array(length);
  let last = 0;
  sites[0] = 0;
  boundaries[0] = -INF;
  boundaries[1] = INF;
  for (let q = 1; q < length; q += 1) {
    let crossing = 0;
    while (true) {
      const site = sites[last];
      crossing = ((values[q] + q * q) - (values[site] + site * site)) / (2 * (q - site));
      if (crossing > boundaries[last] || last === 0) break;
      last -= 1;
    }
    if (crossing <= boundaries[last]) crossing = boundaries[last];
    last += 1;
    sites[last] = q;
    boundaries[last] = crossing;
    boundaries[last + 1] = INF;
  }
  last = 0;
  for (let q = 0; q < length; q += 1) {
    while (boundaries[last + 1] < q) last += 1;
    const delta = q - sites[last];
    output[q] = delta * delta + values[sites[last]];
  }
  return output;
}

function squaredDistanceToAlphaClass(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold: number,
  targetInside: boolean,
) {
  const horizontal = new Float64Array(width * height);
  horizontal.fill(INF);
  for (let y = 0; y < height; y += 1) {
    const row = new Float64Array(width);
    for (let x = 0; x < width; x += 1) {
      const inside = alpha[y * width + x] >= alphaThreshold;
      row[x] = inside === targetInside ? 0 : INF;
    }
    horizontal.set(distanceTransform1D(row), y * width);
  }
  const result = new Float64Array(width * height);
  for (let x = 0; x < width; x += 1) {
    const column = new Float64Array(height);
    for (let y = 0; y < height; y += 1) column[y] = horizontal[y * width + x];
    const transformed = distanceTransform1D(column);
    for (let y = 0; y < height; y += 1) result[y * width + x] = transformed[y];
  }
  return result;
}

/**
 * Builds an inner edge from the true Euclidean distance to the source Alpha
 * boundary. The outer side and its parallel inner offset therefore cannot
 * acquire different corner radii.
 */
export function alphaEdgeMaskPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  edgeWidth: number,
  alphaThreshold = 128,
  normalizeDetectedBody = false,
) {
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const horizontal = new Float64Array(paddedWidth * paddedHeight);
  horizontal.fill(INF);

  for (let y = 0; y < paddedHeight; y += 1) {
    const row = new Float64Array(paddedWidth);
    for (let x = 0; x < paddedWidth; x += 1) {
      const outsideCanvas = x === 0 || y === 0 || x === paddedWidth - 1 || y === paddedHeight - 1;
      const alpha = outsideCanvas ? 0 : pixels[((y - 1) * width + (x - 1)) * 4 + 3];
      row[x] = alpha < alphaThreshold ? 0 : INF;
    }
    horizontal.set(distanceTransform1D(row), y * paddedWidth);
  }

  const squaredDistances = new Float64Array(paddedWidth * paddedHeight);
  for (let x = 0; x < paddedWidth; x += 1) {
    const column = new Float64Array(paddedHeight);
    for (let y = 0; y < paddedHeight; y += 1) column[y] = horizontal[y * paddedWidth + x];
    const transformed = distanceTransform1D(column);
    for (let y = 0; y < paddedHeight; y += 1) squaredDistances[y * paddedWidth + x] = transformed[y];
  }

  const result = new Uint8ClampedArray(width * height * 4);
  const safeWidth = Math.max(0.2, edgeWidth);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const sourceAlpha = pixels[index + 3];
      const fadeStart = alphaThreshold * 0.75;
      // A detected translucent body supplies geometry, not effect opacity.
      // Promote its stable Alpha plateau to a fully opaque mask while keeping
      // the sub-threshold edge ramp for antialiasing.
      const fadeLength = Math.max(1, alphaThreshold * (normalizeDetectedBody ? 0.25 : 0.5));
      const cleanAlpha = Math.max(0, Math.min(1, (sourceAlpha - fadeStart) / fadeLength));
      const distance = Math.sqrt(squaredDistances[(y + 1) * paddedWidth + x + 1]);
      const innerCoverage = Math.max(0, Math.min(1, safeWidth + 1 - distance));
      const alpha = Math.round(255 * cleanAlpha * innerCoverage);
      result[index] = 255;
      result[index + 1] = 255;
      result[index + 2] = 255;
      result[index + 3] = alpha;
    }
  }
  return result;
}

/**
 * Builds a stroke whose placement is measured from the source Alpha contour.
 * The returned canvas is padded when the stroke needs to exist outside the
 * source bounds; callers position that canvas symmetrically around the asset.
 */
export function alphaPositionedEdgeMaskPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  edgeWidth: number,
  position: BorderWrapPosition,
  padding: number,
  alphaThreshold = 128,
  normalizeDetectedBody = false,
) {
  if (position === "inside" && padding === 0) {
    return {
      pixels: alphaEdgeMaskPixels(
        pixels,
        width,
        height,
        edgeWidth,
        alphaThreshold,
        normalizeDetectedBody,
      ),
      width,
      height,
    };
  }

  const safePadding = Math.max(0, Math.ceil(padding));
  const outputWidth = width + safePadding * 2;
  const outputHeight = height + safePadding * 2;
  const outputAlpha = new Uint8ClampedArray(outputWidth * outputHeight);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      outputAlpha[(y + safePadding) * outputWidth + x + safePadding] =
        pixels[(y * width + x) * 4 + 3];
    }
  }

  const distanceToInside = squaredDistanceToAlphaClass(outputAlpha, outputWidth, outputHeight, alphaThreshold, true);
  const distanceToOutside = squaredDistanceToAlphaClass(outputAlpha, outputWidth, outputHeight, alphaThreshold, false);
  const safeWidth = Math.max(0.2, edgeWidth);
  const innerLimit = position === "inside" ? safeWidth : position === "center" ? safeWidth / 2 : 0;
  const outerLimit = position === "outside" ? safeWidth : position === "center" ? safeWidth / 2 : 0;
  const result = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const pixelIndex = y * outputWidth + x;
      const resultIndex = pixelIndex * 4;
      const sourceAlpha = outputAlpha[pixelIndex];
      const inside = sourceAlpha >= alphaThreshold;
      const distance = Math.sqrt((inside ? distanceToOutside : distanceToInside)[pixelIndex]);
      const limit = inside ? innerLimit : outerLimit;
      let coverage = Math.max(0, Math.min(1, limit + 1 - distance));
      if (inside && coverage > 0) {
        const fadeStart = alphaThreshold * 0.75;
        const fadeLength = Math.max(1, alphaThreshold * (normalizeDetectedBody ? 0.25 : 0.5));
        coverage *= Math.max(0, Math.min(1, (sourceAlpha - fadeStart) / fadeLength));
      }
      result[resultIndex] = 255;
      result[resultIndex + 1] = 255;
      result[resultIndex + 2] = 255;
      result[resultIndex + 3] = Math.round(coverage * 255);
    }
  }
  return { pixels: result, width: outputWidth, height: outputHeight };
}

type Point = { x: number; y: number };

const cross = (origin: Point, left: Point, right: Point) =>
  (left.x - origin.x) * (right.y - origin.y) -
  (left.y - origin.y) * (right.x - origin.x);

function convexHull(points: Point[]) {
  if (points.length <= 1) return points;
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const half = (values: Point[]) => {
    const result: Point[] = [];
    for (const point of values) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) {
        result.pop();
      }
      result.push(point);
    }
    return result;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function pointInsidePolygon(x: number, y: number, polygon: Point[]) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    if (((a.y > y) !== (b.y > y)) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function alphaIslandCount(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 128,
) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let islands = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || pixels[start * 4 + 3] < alphaThreshold) continue;
      islands += 1;
      let head = 0;
      let tail = 0;
      visited[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const index = queue[head++];
        const currentY = Math.floor(index / width);
        const currentX = index - currentY * width;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const nextY = currentY + offsetY;
          if (nextY < 0 || nextY >= height) continue;
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const nextX = currentX + offsetX;
            if ((offsetX === 0 && offsetY === 0) || nextX < 0 || nextX >= width) continue;
            const next = nextY * width + nextX;
            if (visited[next] || pixels[next * 4 + 3] < alphaThreshold) continue;
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }
  }
  return islands;
}

/**
 * Treats disconnected Alpha islands as one piece of artwork. The filled convex
 * envelope provides one unambiguous exterior perimeter instead of outlining
 * every glyph and detached stroke independently. Four sub-pixel samples keep
 * the generated boundary antialiased before the Euclidean edge mask is built.
 */
export function alphaGroupEnvelopePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 128,
) {
  const candidates: Point[] = [];
  for (let y = 0; y < height; y += 1) {
    let left = width;
    let right = -1;
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < alphaThreshold) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
    if (right < left) continue;
    candidates.push(
      { x: left, y },
      { x: right + 1, y },
      { x: right + 1, y: y + 1 },
      { x: left, y: y + 1 },
    );
  }
  const hull = convexHull(candidates);
  const result = new Uint8ClampedArray(width * height * 4);
  if (hull.length < 3) return result;
  const left = Math.max(0, Math.floor(hull.reduce((value, point) => Math.min(value, point.x), width)));
  const right = Math.min(width - 1, Math.ceil(hull.reduce((value, point) => Math.max(value, point.x), 0)));
  const top = Math.max(0, Math.floor(hull.reduce((value, point) => Math.min(value, point.y), height)));
  const bottom = Math.min(height - 1, Math.ceil(hull.reduce((value, point) => Math.max(value, point.y), 0)));
  const samples = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      let coverage = 0;
      for (const [offsetX, offsetY] of samples) {
        if (pointInsidePolygon(x + offsetX, y + offsetY, hull)) coverage += 1;
      }
      if (coverage === 0) continue;
      const index = (y * width + x) * 4;
      result[index] = 255;
      result[index + 1] = 255;
      result[index + 2] = 255;
      result[index + 3] = Math.round((coverage / samples.length) * 255);
    }
  }
  return result;
}
