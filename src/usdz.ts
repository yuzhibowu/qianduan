import { strToU8, zipSync } from "fflate";
import { compensateToLinear, srgbToLinear, type ColorComp } from "./lib/color";

export type CoinUsdzSettings = {
  duration: number;
  delay: number;
  fps: number;
  speed: number;
  ringSpeed: number;
  count: number;
  coinSize: number;
  spread: number;
  baseColor: string;
  colorComp?: ColorComp;
  emissiveLift?: number;
  unlit?: boolean;
};
export type DiscSplitUsdzSettings = CoinUsdzSettings & {
  innerRadius: number;
  accentColor: string;
};
const TAU = Math.PI * 2;
const turns = (value: number) =>
  value <= 0 ? 0 : Math.max(1, Math.round(value / 50));
const degrees = (
  time: number,
  value: number,
  duration: number,
  delay: number,
) =>
  duration > 0
    ? (Math.max(0, time - delay) / duration) * 360 * turns(value)
    : 0;
const matrix4 = (
  x: number,
  y: number,
  z: number,
  tx: number,
  ty: number,
  scale = 1,
) => {
  const rx = (x * Math.PI) / 180,
    ry = (y * Math.PI) / 180,
    rz = (z * Math.PI) / 180,
    sx = Math.sin(rx),
    cx = Math.cos(rx),
    sy = Math.sin(ry),
    cy = Math.cos(ry),
    sz = Math.sin(rz),
    cz = Math.cos(rz);
  return `(( ${cy * cz * scale}, ${cy * sz * scale}, ${-sy * scale}, 0), ( ${(sx * sy * cz - cx * sz) * scale}, ${(sx * sy * sz + cx * cz) * scale}, ${sx * cy * scale}, 0), ( ${(cx * sy * cz + sx * sz) * scale}, ${(cx * sy * sz - sx * cz) * scale}, ${cx * cy * scale}, 0), ( ${tx}, ${ty}, 0, 1))`;
};
function geometry(segments = 64) {
  const points: number[][] = [],
    normals: number[][] = [],
    indices: number[] = [],
    counts: number[] = [];
  const half = 0.05;
  for (let row = 0; row <= 1; row++) {
    const y = row === 0 ? half : -half;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU,
        x = Math.sin(a),
        z = Math.cos(a);
      points.push([x, y, z]);
      normals.push([x, 0, z]);
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i,
      d = i + 1,
      b = segments + 1 + i,
      c = b + 1;
    indices.push(a, b, d, b, c, d);
    counts.push(3, 3);
  }
  const cap = (top: boolean) => {
    const y = top ? half : -half,
      center = points.length;
    points.push([0, y, 0]);
    normals.push([0, top ? 1 : -1, 0]);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * TAU;
      points.push([Math.sin(a), y, Math.cos(a)]);
      normals.push([0, top ? 1 : -1, 0]);
    }
    for (let i = 0; i < segments; i++) {
      const a = center + 1 + i,
        b = a + 1;
      indices.push(center, top ? a : b, top ? b : a);
      counts.push(3);
    }
  };
  cap(true);
  cap(false);
  return { points, normals, indices, counts };
}
const tuples = (v: number[][]) =>
  `[${v.map((a) => `(${a.map((n) => Number(n.toFixed(8))).join(",")})`).join(",")}]`;
const list = (v: number[]) => `[${v.join(",")}]`;
const linearRgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ] as [number, number, number];
};

export function buildCoinUsdz(s: CoinUsdzSettings) {
  const frames = Math.max(1, Math.round((s.duration + s.delay) * s.fps)),
    end = frames - 1,
    g = geometry();
  const color =
    (s.colorComp ? compensateToLinear(s.baseColor, s.colorComp) : null) ??
    linearRgb(s.baseColor);
  const unlit = Boolean(s.unlit),
    lift = unlit ? 1 : Math.max(0, Math.min(1, s.emissiveLift ?? 0));
  const diffuse = unlit ? [0, 0, 0] : color;
  const emissive = color.map((v) => v * lift);
  const samples = (fn: (t: number) => string) =>
    `{${Array.from({ length: frames }, (_, f) => `${f}: ${fn(f / s.fps)}`).join(",")}}`;
  const mesh = `def Mesh "CoinMesh" (prepend apiSchemas = ["MaterialBindingAPI"]) {
  uniform token subdivisionScheme = "none"
  point3f[] points = ${tuples(g.points)}
  int[] faceVertexCounts = ${list(g.counts)}
  int[] faceVertexIndices = ${list(g.indices)}
  normal3f[] normals = ${tuples(g.normals)} (interpolation = "vertex")
  rel material:binding = </CoinLoader/CoinMaterial>
}`;
  const coins = Array.from({ length: s.count }, (_, i) => {
    const angle = (i / s.count) * 360,
      p = (i / s.count) * TAU + TAU / s.count,
      x = (Math.cos(p) * 3 * s.spread) / 100,
      y = (Math.sin(p) * 3 * s.spread) / 100;
    return `def Xform "Coin${i + 1}" {
  matrix4d xformOp:transform.timeSamples = ${samples((t) => {
    const d = degrees(t, s.speed, s.duration, s.delay);
    return matrix4(
      d,
      180 / s.count + d,
      angle + 90 + d,
      x,
      y,
      s.coinSize / 100,
    );
  })}
  uniform token[] xformOpOrder = ["xformOp:transform"]
  ${mesh}
}`;
  }).join("\n");
  const ring = samples((t) =>
    matrix4(0, 0, -degrees(t, s.ringSpeed, s.duration, s.delay), 0, 0, 1),
  );
  const model = `#usda 1.0
(
  defaultPrim = "CoinLoader"
  metersPerUnit = 1
  upAxis = "Y"
  startTimeCode = 0
  endTimeCode = ${end}
  framesPerSecond = ${s.fps}
  timeCodesPerSecond = ${s.fps}
  playbackMode = "loop"
  autoPlay = true
)
def Xform "CoinLoader" {
  matrix4d xformOp:transform:ring.timeSamples = ${ring}
  float3 xformOp:scale = (0.6,0.6,0.6)
  uniform token[] xformOpOrder = ["xformOp:transform:ring","xformOp:scale"]
  def Material "CoinMaterial" {
    token outputs:surface.connect = </CoinLoader/CoinMaterial/Surface.outputs:surface>
    def Shader "Surface" {
      uniform token info:id = "UsdPreviewSurface"
      color3f inputs:diffuseColor = (${diffuse.map((v) => v.toFixed(6)).join(",")})
      color3f inputs:emissiveColor = (${emissive.map((v) => v.toFixed(6)).join(",")})
      float inputs:metallic = 1
      float inputs:roughness = 0.2
      token outputs:surface
    }
  }
  ${coins}
}`;
  const data = strToU8(model),
    name = "model.usda",
    padding = (64 - ((30 + name.length + 4) % 64)) % 64;
  return {
    bytes: zipSync(
      { [name]: [data, { extra: { 6530: new Uint8Array(padding) } }] },
      { level: 0 },
    ),
    frames,
  };
}

function discGeometry(
  count: number,
  innerRadius: number,
  thickness: number,
  segments = 32,
) {
  const points: number[][] = [],
    normals: number[][] = [],
    indices: number[] = [],
    counts: number[] = [];
  const span = TAU / count;
  const vertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
  ) => {
    points.push([x, y, z]);
    normals.push([nx, ny, nz]);
    return points.length - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => {
    indices.push(a, b, c, a, c, d);
    counts.push(3, 3);
  };
  for (let step = 0; step < segments; step++) {
    const start = (step / segments) * span,
      end = ((step + 1) / segments) * span,
      cs = Math.cos(start),
      ss = Math.sin(start),
      ce = Math.cos(end),
      se = Math.sin(end);
    quad(
      vertex(innerRadius * cs, innerRadius * ss, thickness, 0, 0, 1),
      vertex(cs, ss, thickness, 0, 0, 1),
      vertex(ce, se, thickness, 0, 0, 1),
      vertex(innerRadius * ce, innerRadius * se, thickness, 0, 0, 1),
    );
    quad(
      vertex(innerRadius * ce, innerRadius * se, 0, 0, 0, -1),
      vertex(ce, se, 0, 0, 0, -1),
      vertex(cs, ss, 0, 0, 0, -1),
      vertex(innerRadius * cs, innerRadius * ss, 0, 0, 0, -1),
    );
    quad(
      vertex(cs, ss, 0, cs, ss, 0),
      vertex(ce, se, 0, ce, se, 0),
      vertex(ce, se, thickness, ce, se, 0),
      vertex(cs, ss, thickness, cs, ss, 0),
    );
    quad(
      vertex(innerRadius * ce, innerRadius * se, 0, -ce, -se, 0),
      vertex(innerRadius * cs, innerRadius * ss, 0, -cs, -ss, 0),
      vertex(innerRadius * cs, innerRadius * ss, thickness, -cs, -ss, 0),
      vertex(innerRadius * ce, innerRadius * se, thickness, -ce, -se, 0),
    );
  }
  const radial = (angle: number, sign: number) => {
    const c = Math.cos(angle),
      s = Math.sin(angle),
      nx = sign * -s,
      ny = sign * c,
      a = vertex(innerRadius * c, innerRadius * s, 0, nx, ny, 0),
      b = vertex(c, s, 0, nx, ny, 0),
      cc = vertex(c, s, thickness, nx, ny, 0),
      d = vertex(innerRadius * c, innerRadius * s, thickness, nx, ny, 0);
    sign > 0 ? quad(a, b, cc, d) : quad(d, cc, b, a);
  };
  radial(0, 1);
  radial(span, -1);
  return { points, normals, indices, counts };
}

type M4 = number[];
const mIdentity = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mMultiply = (a: M4, b: M4): M4 => {
  const out = Array(16).fill(0);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4],
      b1 = b[col * 4 + 1],
      b2 = b[col * 4 + 2],
      b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
};
const mTranslation = (x: number, y: number, z: number): M4 => {
  const m = mIdentity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
};
const mScale = (v: number): M4 => {
  const m = mIdentity();
  m[0] = m[5] = m[10] = v;
  return m;
};
const mRotateX = (a: number): M4 => {
  const m = mIdentity(),
    c = Math.cos(a),
    s = Math.sin(a);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
};
const mRotateY = (a: number): M4 => {
  const m = mIdentity(),
    c = Math.cos(a),
    s = Math.sin(a);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
};
const mRotateZ = (a: number): M4 => {
  const m = mIdentity(),
    c = Math.cos(a),
    s = Math.sin(a);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
};
// WebGL stores matrices column-major. USD's textual matrix4d uses row-vector
// transforms, so each stored WebGL column becomes one USD row. Transposing it
// again would put translation in USD's last column and lose the wedge burst.
const usdMatrix = (m: M4) =>
  `(${[0, 1, 2, 3]
    .map(
      (row) =>
        `(${m
          .slice(row * 4, row * 4 + 4)
          .map((value) => Number(value.toFixed(8)))
          .join(",")})`,
    )
    .join(",")})`;
const easeOut = (v: number) => 1 - (1 - v) * (1 - v);

export function buildDiscSplitUsdz(s: DiscSplitUsdzSettings) {
  const frames = Math.max(1, Math.round((s.duration + s.delay) * s.fps)),
    end = frames - 1,
    count = Math.max(2, Math.round(s.count));
  const thickness = (0.3 * Math.max(10, Math.min(400, s.coinSize))) / 100,
    inner = Math.max(0, Math.min(90, s.innerRadius)) / 100,
    burstDistance = (0.5 * Math.max(0, Math.min(300, s.spread))) / 100;
  const g = discGeometry(count, inner, thickness);
  const color =
      (s.colorComp ? compensateToLinear(s.baseColor, s.colorComp) : null) ??
      linearRgb(s.baseColor),
    unlit = Boolean(s.unlit),
    lift = unlit ? 1 : Math.max(0, Math.min(1, s.emissiveLift ?? 0)),
    diffuse = unlit ? [0, 0, 0] : color,
    emissive = color.map((v) => v * lift);
  const samples = (index: number) =>
    `{${Array.from({ length: frames }, (_, frame) => {
      const t = Math.max(0, frame / s.fps - s.delay),
        phase = s.duration > 0 ? (t / s.duration) * 3 : 0,
        wrapped = ((phase % 3) + 3) % 3,
        returnStart = easeOut(1 / 1.5),
        burst =
          wrapped < 1
            ? easeOut(Math.min(1, wrapped / 1.5))
            : returnStart * (1 - easeOut(Math.min(1, (wrapped - 1) / 1.5))),
        turn = Math.PI * easeOut(Math.min(1, wrapped / 2)),
        angle = (index / count) * TAU;
      let m = mScale(1.6);
      m = mMultiply(m, mTranslation(0, 0, thickness / 2));
      m = mMultiply(m, mRotateX(Math.PI / 2));
      m = mMultiply(
        m,
        mTranslation(
          Math.sin(angle) * burstDistance * burst,
          0,
          Math.cos(angle) * burstDistance * burst,
        ),
      );
      m = mMultiply(m, mRotateY(angle));
      m = mMultiply(m, mRotateZ(turn));
      m = mMultiply(m, mRotateX(Math.PI / 2));
      return `${frame}: ${usdMatrix(m)}`;
    }).join(",")}}`;
  const mesh = `def Mesh "DiscMesh" (prepend apiSchemas = ["MaterialBindingAPI"]) {
  uniform token subdivisionScheme = "none"
  point3f[] points = ${tuples(g.points)}
  int[] faceVertexCounts = ${list(g.counts)}
  int[] faceVertexIndices = ${list(g.indices)}
  normal3f[] normals = ${tuples(g.normals)} (interpolation = "vertex")
  rel material:binding = </DiscSplit/DiscMaterial>
}`;
  const pieces = Array.from(
    { length: count },
    (_, index) => `def Xform "Piece${index + 1}" {
  matrix4d xformOp:transform.timeSamples = ${samples(index)}
  uniform token[] xformOpOrder = ["xformOp:transform"]
  ${mesh}
}`,
  ).join("\n");
  const model = `#usda 1.0
(
  defaultPrim = "DiscSplit"
  metersPerUnit = 1
  upAxis = "Y"
  startTimeCode = 0
  endTimeCode = ${end}
  framesPerSecond = ${s.fps}
  timeCodesPerSecond = ${s.fps}
  playbackMode = "loop"
  autoPlay = true
)
def Xform "DiscSplit" {
  def Material "DiscMaterial" {
    token outputs:surface.connect = </DiscSplit/DiscMaterial/Surface.outputs:surface>
    def Shader "Surface" {
      uniform token info:id = "UsdPreviewSurface"
      color3f inputs:diffuseColor = (${diffuse.map((v) => v.toFixed(6)).join(",")})
      color3f inputs:emissiveColor = (${emissive.map((v) => v.toFixed(6)).join(",")})
      float inputs:metallic = 1
      float inputs:roughness = 0.2
      token outputs:surface
    }
  }
  ${pieces}
}`;
  const data = strToU8(model),
    name = "model.usda",
    padding = (64 - ((30 + name.length + 4) % 64)) % 64;
  return {
    bytes: zipSync(
      { [name]: [data, { extra: { 6530: new Uint8Array(padding) } }] },
      { level: 0 },
    ),
    frames,
  };
}

export function downloadUsdz(bytes: Uint8Array, name: string) {
  const blob = new Blob([bytes as BlobPart], { type: "model/vnd.usdz+zip" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
