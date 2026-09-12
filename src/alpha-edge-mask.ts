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
