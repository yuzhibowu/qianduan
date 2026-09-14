const INF = 1e20;

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
      const sourceAlpha = pixels[index + 3] / 255;
      const cleanAlpha = Math.max(0, Math.min(1, sourceAlpha * 4 - 1.5));
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
