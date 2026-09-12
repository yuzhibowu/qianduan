type Point = { x: number; y: number };
type Edge = { from: Point; to: Point; used: boolean };

const key = (point: Point) => `${point.x},${point.y}`;

function area(points: Point[]) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    total += current.x * next.y - next.x * current.y;
  }
  return total / 2;
}

function loopsFromAlpha(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
) {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height &&
    pixels[(y * width + x) * 4 + 3] >= threshold;
  const edges: Edge[] = [];
  const add = (from: Point, to: Point) => edges.push({ from, to, used: false });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add({ x, y }, { x: x + 1, y });
      if (!inside(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!inside(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!inside(x - 1, y)) add({ x, y: y + 1 }, { x, y });
    }
  }

  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const start = key(edge.from);
    outgoing.set(start, [...(outgoing.get(start) ?? []), index]);
  });
  const loops: Point[][] = [];
  for (let start = 0; start < edges.length; start += 1) {
    if (edges[start].used) continue;
    const points: Point[] = [];
    const startKey = key(edges[start].from);
    let edgeIndex = start;
    while (!edges[edgeIndex].used) {
      const edge = edges[edgeIndex];
      edge.used = true;
      points.push(edge.from);
      const nextKey = key(edge.to);
      if (nextKey === startKey) break;
      const next = (outgoing.get(nextKey) ?? []).find((candidate) => !edges[candidate].used);
      if (next === undefined) break;
      edgeIndex = next;
    }
    if (points.length >= 3) loops.push(points);
  }
  return loops;
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const amount = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
  ));
  return Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy));
}

function simplifyOpen(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  let split = 0;
  let maximum = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], points[0], points[points.length - 1]);
    if (distance > maximum) {
      maximum = distance;
      split = index;
    }
  }
  if (maximum <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplifyOpen(points.slice(0, split + 1), tolerance);
  const right = simplifyOpen(points.slice(split), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyClosed(points: Point[], tolerance: number) {
  if (points.length < 4) return points;
  let opposite = 1;
  let maximum = 0;
  for (let index = 1; index < points.length; index += 1) {
    const distance = Math.hypot(points[index].x - points[0].x, points[index].y - points[0].y);
    if (distance > maximum) {
      maximum = distance;
      opposite = index;
    }
  }
  const first = simplifyOpen(points.slice(0, opposite + 1), tolerance);
  const second = simplifyOpen([...points.slice(opposite), points[0]], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

function clockwiseFromTopLeft(points: Point[]) {
  const clockwise = area(points) < 0 ? [...points].reverse() : [...points];
  let start = 0;
  for (let index = 1; index < clockwise.length; index += 1) {
    const current = clockwise[index];
    const previous = clockwise[start];
    if (current.x + current.y < previous.x + previous.y ||
      (current.x + current.y === previous.x + previous.y && current.y < previous.y)) start = index;
  }
  return [...clockwise.slice(start), ...clockwise.slice(0, start)];
}

function outerContour(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
) {
  const loops = loopsFromAlpha(pixels, width, height, threshold);
  const outer = loops.sort((left, right) => Math.abs(area(right)) - Math.abs(area(left)))[0];
  const tolerance = Math.max(1, Math.min(width, height) / 360);
  return outer ? clockwiseFromTopLeft(simplifyClosed(outer, tolerance)) : [];
}

function turnDegrees(previous: Point, current: Point, next: Point) {
  const incoming = Math.atan2(current.y - previous.y, current.x - previous.x);
  const outgoing = Math.atan2(next.y - current.y, next.x - current.x);
  let turn = Math.abs(outgoing - incoming);
  if (turn > Math.PI) turn = Math.PI * 2 - turn;
  return (turn * 180) / Math.PI;
}

const midpoint = (left: Point, right: Point) => ({
  x: (left.x + right.x) / 2,
  y: (left.y + right.y) / 2,
});

const coordinate = (value: number) => Number(value.toFixed(2));

function pointAtDistance(points: Point[], index: number, direction: -1 | 1, distance: number) {
  let currentIndex = index;
  let travelled = 0;
  while (travelled < distance) {
    const nextIndex = (currentIndex + direction + points.length) % points.length;
    const current = points[currentIndex];
    const next = points[nextIndex];
    travelled += Math.hypot(next.x - current.x, next.y - current.y);
    currentIndex = nextIndex;
    if (currentIndex === index) break;
  }
  return points[currentIndex];
}

function smoothNonCorners(points: Point[], corners: boolean[]) {
  let result = points.map((point) => ({ ...point }));
  for (let pass = 0; pass < 2; pass += 1) {
    const previous = result;
    result = previous.map((point, index) => {
      if (corners[index]) return point;
      const before = previous[(index - 1 + previous.length) % previous.length];
      const after = previous[(index + 1) % previous.length];
      return {
        x: (before.x + point.x * 2 + after.x) / 4,
        y: (before.y + point.y * 2 + after.y) / 4,
      };
    });
  }
  return result;
}

export function alphaOutlinePath(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128,
) {
  const points = outerContour(pixels, width, height, threshold);
  if (points.length < 3) return "";
  const lookDistance = Math.max(4, Math.min(width, height) * 0.06);
  const corners = points.map((point, index) =>
    turnDegrees(
      pointAtDistance(points, index, -1, lookDistance),
      point,
      pointAtDistance(points, index, 1, lookDistance),
    ) >= 55,
  );
  const smoothed = smoothNonCorners(points, corners);
  const first = corners[0]
    ? smoothed[0]
    : midpoint(smoothed[smoothed.length - 1], smoothed[0]);
  const commands = [`M ${coordinate(first.x)} ${coordinate(first.y)}`];
  for (let index = 0; index < smoothed.length; index += 1) {
    const previous = smoothed[(index - 1 + smoothed.length) % smoothed.length];
    const current = smoothed[index];
    const next = smoothed[(index + 1) % smoothed.length];
    if (corners[index]) {
      commands.push(`L ${coordinate(current.x)} ${coordinate(current.y)}`);
      continue;
    }
    const entry = midpoint(previous, current);
    const exit = midpoint(current, next);
    commands.push(
      `L ${coordinate(entry.x)} ${coordinate(entry.y)} ` +
      `Q ${coordinate(current.x)} ${coordinate(current.y)} ${coordinate(exit.x)} ${coordinate(exit.y)}`,
    );
  }
  commands.push("Z");
  return commands.join(" ");
}

export function perimeterAngleLut(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128,
  sampleCount = 720,
) {
  const points = outerContour(pixels, width, height, threshold);
  if (!points.length) return [];
  const cumulative = [0];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    cumulative.push(cumulative[index] + Math.hypot(next.x - current.x, next.y - current.y));
  }
  const perimeter = cumulative[cumulative.length - 1];
  if (perimeter <= 0) return [];

  const result: number[] = [];
  let segment = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const target = (sample / sampleCount) * perimeter;
    while (segment + 1 < cumulative.length - 1 && cumulative[segment + 1] < target) segment += 1;
    const current = points[segment % points.length];
    const next = points[(segment + 1) % points.length];
    const segmentLength = cumulative[segment + 1] - cumulative[segment];
    const amount = segmentLength > 0 ? (target - cumulative[segment]) / segmentLength : 0;
    const x = current.x + (next.x - current.x) * amount;
    const y = current.y + (next.y - current.y) * amount;
    result.push((Math.atan2(x - width / 2, height / 2 - y) * 180) / Math.PI);
  }
  return result;
}

export function angleAtPerimeterPhase(angles: number[], phase: number) {
  if (!angles.length) return 0;
  const normalized = ((phase % 1) + 1) % 1;
  const position = normalized * angles.length;
  const index = Math.floor(position) % angles.length;
  const nextIndex = (index + 1) % angles.length;
  let difference = angles[nextIndex] - angles[index];
  while (difference > 180) difference -= 360;
  while (difference < -180) difference += 360;
  return angles[index] + difference * (position - Math.floor(position));
}
