import { strToU8, zipSync } from "fflate";
import { compensateToLinear, srgbToLinear, type ColorComp } from "./lib/color";
import { DEFAULT_APPEARANCE, type SurfaceAppearance } from "./appearance";

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
  appearance?: SurfaceAppearance;
};
export type DiscSplitUsdzSettings = CoinUsdzSettings & {
  innerRadius: number;
  accentColor: string;
};
export type GyroLoaderUsdzSettings = CoinUsdzSettings & {
  accentColor: string;
};
export type FrostedTypeBandUsdzSettings = CoinUsdzSettings & {
  frostedTypeBand: {
    items: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    fontStyle: "normal" | "italic";
    letterSpacing: number;
    textColor: string;
    speed: number;
    distance: number;
    tilt: number;
    gap: number;
    blur: number;
    refraction: number;
    tint: string;
    grain: number;
  };
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
const dataUrlAsset = (value: string | undefined, fallback: string) => {
  if (!value) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i.exec(value);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const extension = match[1].toLowerCase() === "image/jpeg" ? "jpg" : match[1].split("/")[1];
  return { name: `textures/${fallback}.${extension}`, bytes };
};
const textureMaterialDefinition = (
  root: string,
  name: string,
  asset: string,
  appearance: SurfaceAppearance["material"],
) => `def Material "${name}" {
    token outputs:surface.connect = </${root}/${name}/Surface.outputs:surface>
    def Shader "Surface" {
      uniform token info:id = "UsdPreviewSurface"
      color3f inputs:diffuseColor.connect = </${root}/${name}/Texture.outputs:rgb>
      float inputs:metallic = ${appearance.metallic.toFixed(4)}
      float inputs:roughness = ${appearance.roughness.toFixed(4)}
      float inputs:opacity = ${appearance.opacity.toFixed(4)}
      float inputs:ior = ${appearance.ior.toFixed(4)}
      token outputs:surface
    }
    def Shader "Texture" {
      uniform token info:id = "UsdUVTexture"
      asset inputs:file = @${asset}@
      token inputs:sourceColorSpace = "sRGB"
      float2 inputs:st.connect = </${root}/${name}/Primvar.outputs:result>
      float3 outputs:rgb
    }
    def Shader "Primvar" {
      uniform token info:id = "UsdPrimvarReader_float2"
      token inputs:varname = "st"
      float2 outputs:result
    }
  }`;
const subset = (name: string, faces: number[], materialPath: string) =>
  faces.length
    ? `def GeomSubset "${name}" (prepend apiSchemas = ["MaterialBindingAPI"]) {
    uniform token elementType = "face"
    uniform token familyName = "materialBind"
    int[] indices = ${list(faces)}
    rel material:binding = <${materialPath}>
  }`
    : "";
const alignedUsdz = (files: { name: string; data: Uint8Array }[]) => {
  let offset = 0;
  const entries: Record<
    string,
    [Uint8Array, { extra: Record<number, Uint8Array> }]
  > = {};
  files.forEach(({ name, data }) => {
    const padding = (64 - ((offset + 30 + name.length + 4) % 64)) % 64;
    entries[name] = [data, { extra: { 6530: new Uint8Array(padding) } }];
    offset += 30 + name.length + 4 + padding + data.length;
  });
  return zipSync(entries, { level: 0 });
};
const linearRgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ] as [number, number, number];
};
const materialValues = (s: CoinUsdzSettings) => {
  const material = s.appearance?.enabled
    ? s.appearance.material
    : { ...DEFAULT_APPEARANCE.material, color: s.baseColor, metallic: 1, roughness: 0.2, opacity: 1 };
  const color =
    (s.colorComp ? compensateToLinear(material.color, s.colorComp) : null) ??
    linearRgb(material.color || s.baseColor);
  return { material, color };
};
const materialDefinition = (
  root: string,
  name: string,
  color: number[],
  appearance: SurfaceAppearance["material"],
) => `def Material "${name}" {
    token outputs:surface.connect = </${root}/${name}/Surface.outputs:surface>
    def Shader "Surface" {
      uniform token info:id = "UsdPreviewSurface"
      color3f inputs:diffuseColor = (${color.map((v) => v.toFixed(6)).join(",")})
      color3f inputs:emissiveColor = (0,0,0)
      float inputs:metallic = ${appearance.metallic.toFixed(4)}
      float inputs:roughness = ${appearance.roughness.toFixed(4)}
      float inputs:opacity = ${appearance.opacity.toFixed(4)}
      float inputs:ior = ${appearance.ior.toFixed(4)}
      token outputs:surface
    }
  }`;

export function buildCoinUsdz(s: CoinUsdzSettings) {
  const frames = Math.max(1, Math.round((s.duration + s.delay) * s.fps)),
    end = frames - 1,
    g = geometry();
  const frontAsset = dataUrlAsset(s.appearance?.enabled ? s.appearance.frontTexture : undefined, "front"),
    backAsset = dataUrlAsset(s.appearance?.enabled ? s.appearance.backTexture : undefined, "back"),
    sideFaces = 64 * 2,
    frontFaces = Array.from({ length: 64 }, (_, i) => sideFaces + i),
    backFaces = Array.from({ length: 64 }, (_, i) => sideFaces + 64 + i),
    uvs = g.points.map(([x, _y, z]) => [x * 0.5 + 0.5, z * 0.5 + 0.5]);
  const { material, color } = materialValues(s);
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
  texCoord2f[] primvars:st = ${tuples(uvs)} (interpolation = "vertex")
  rel material:binding = </CoinLoader/CoinMaterial>
  ${frontAsset ? subset("Front", frontFaces, "/CoinLoader/FrontMaterial") : ""}
  ${backAsset ? subset("Back", backFaces, "/CoinLoader/BackMaterial") : ""}
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
  ${materialDefinition("CoinLoader", "CoinMaterial", diffuse, material)}
  ${frontAsset ? textureMaterialDefinition("CoinLoader", "FrontMaterial", frontAsset.name, material) : ""}
  ${backAsset ? textureMaterialDefinition("CoinLoader", "BackMaterial", backAsset.name, material) : ""}
  ${coins}
}`;
  const data = strToU8(model),
    name = "model.usda";
  return {
    bytes: alignedUsdz([
      { name, data },
      ...(frontAsset ? [{ name: frontAsset.name, data: frontAsset.bytes }] : []),
      ...(backAsset ? [{ name: backAsset.name, data: backAsset.bytes }] : []),
    ]),
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
  const frontAsset = dataUrlAsset(s.appearance?.enabled ? s.appearance.frontTexture : undefined, "front"),
    backAsset = dataUrlAsset(s.appearance?.enabled ? s.appearance.backTexture : undefined, "back"),
    facesPerBand = 2 * 4,
    frontFaces = Array.from({ length: 32 * facesPerBand + 4 }, (_, face) => face).filter((face) => face < 32 * 8 && face % 8 < 2),
    backFaces = Array.from({ length: 32 * facesPerBand + 4 }, (_, face) => face).filter((face) => face < 32 * 8 && face % 8 >= 2 && face % 8 < 4);
  const { material, color } = materialValues(s),
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
  const mesh = (pieceIndex: number) => {
    const angle = (pieceIndex / count) * TAU,
      uvs = g.points.map(([x, y]) => {
        const rx = x * Math.cos(angle) - y * Math.sin(angle),
          ry = x * Math.sin(angle) + y * Math.cos(angle);
        return [rx * 0.5 + 0.5, ry * 0.5 + 0.5];
      });
    return `def Mesh "DiscMesh" (prepend apiSchemas = ["MaterialBindingAPI"]) {
  uniform token subdivisionScheme = "none"
  point3f[] points = ${tuples(g.points)}
  int[] faceVertexCounts = ${list(g.counts)}
  int[] faceVertexIndices = ${list(g.indices)}
  normal3f[] normals = ${tuples(g.normals)} (interpolation = "vertex")
  texCoord2f[] primvars:st = ${tuples(uvs)} (interpolation = "vertex")
  rel material:binding = </DiscSplit/DiscMaterial>
  ${frontAsset ? subset("Front", frontFaces, "/DiscSplit/FrontMaterial") : ""}
  ${backAsset ? subset("Back", backFaces, "/DiscSplit/BackMaterial") : ""}
}`; };
  const pieces = Array.from(
    { length: count },
    (_, index) => `def Xform "Piece${index + 1}" {
  matrix4d xformOp:transform.timeSamples = ${samples(index)}
  uniform token[] xformOpOrder = ["xformOp:transform"]
  ${mesh(index)}
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
  ${materialDefinition("DiscSplit", "DiscMaterial", diffuse, material)}
  ${frontAsset ? textureMaterialDefinition("DiscSplit", "FrontMaterial", frontAsset.name, material) : ""}
  ${backAsset ? textureMaterialDefinition("DiscSplit", "BackMaterial", backAsset.name, material) : ""}
  ${pieces}
}`;
  const data = strToU8(model),
    name = "model.usda";
  return {
    bytes: alignedUsdz([
      { name, data },
      ...(frontAsset ? [{ name: frontAsset.name, data: frontAsset.bytes }] : []),
      ...(backAsset ? [{ name: backAsset.name, data: backAsset.bytes }] : []),
    ]),
    frames,
  };
}

function gyroTorusGeometry(
  radius: number,
  tube: number,
  radialSegments = 20,
  tubularSegments = 80,
) {
  const points: number[][] = [],
    normals: number[][] = [],
    indices: number[] = [],
    counts: number[] = [];
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const v = (radial / radialSegments) * TAU,
      cosineV = Math.cos(v),
      sineV = Math.sin(v);
    for (let tubular = 0; tubular <= tubularSegments; tubular += 1) {
      const u = (tubular / tubularSegments) * TAU,
        cosineU = Math.cos(u),
        sineU = Math.sin(u);
      points.push([
        (radius + tube * cosineV) * sineU,
        (radius + tube * cosineV) * cosineU,
        tube * sineV,
      ]);
      normals.push([cosineV * sineU, cosineV * cosineU, sineV]);
    }
  }
  for (let radial = 1; radial <= radialSegments; radial += 1) {
    for (let tubular = 1; tubular <= tubularSegments; tubular += 1) {
      const a = (tubularSegments + 1) * radial + tubular - 1,
        b = (tubularSegments + 1) * (radial - 1) + tubular - 1,
        c = (tubularSegments + 1) * (radial - 1) + tubular,
        d = (tubularSegments + 1) * radial + tubular;
      indices.push(a, b, d, b, c, d);
      counts.push(3, 3);
    }
  }
  return { points, normals, indices, counts };
}

export function buildGyroLoaderUsdz(s: GyroLoaderUsdzSettings) {
  const frames = Math.max(1, Math.round((s.duration + s.delay) * s.fps)),
    end = frames - 1,
    count = Math.max(1, Math.round(s.count)),
    tube = (0.1 * Math.max(20, Math.min(400, s.coinSize))) / 100,
    stagger = Math.max(0, Math.min(600, s.spread)) / 1000,
    pause = Math.max(0, Math.min(2000, s.ringSpeed)) / 1000,
    motionDuration = Math.max(
      0.001,
      s.duration - stagger * (count - 1) - pause,
    );
  const { material, color } = materialValues(s),
    unlit = Boolean(s.unlit),
    lift = unlit ? 1 : Math.max(0, Math.min(1, s.emissiveLift ?? 0)),
    diffuse = unlit ? [0, 0, 0] : color,
    emissive = color.map((value) => value * lift);
  const samples = (index: number) =>
    `{${Array.from({ length: frames }, (_, frame) => {
      const time = Math.max(0, frame / s.fps - s.delay),
        progress = Math.min(
          1,
          Math.max(0, (time - index * stagger) / motionDuration),
        ),
        eased =
          progress < 0.5
            ? 2 * progress * progress
            : 1 - 2 * (1 - progress) ** 2;
      return `${frame}: ${usdMatrix(mMultiply(mRotateX(-eased * TAU), mRotateY(eased * TAU)))}`;
    }).join(",")}}`;
  const rings = Array.from({ length: count }, (_, index) => {
    const geometry = gyroTorusGeometry((index + 1) * 0.5, tube);
    return `def Xform "Ring${index + 1}" {
  matrix4d xformOp:transform.timeSamples = ${samples(index)}
  uniform token[] xformOpOrder = ["xformOp:transform"]
  def Mesh "RingMesh" (prepend apiSchemas = ["MaterialBindingAPI"]) {
    uniform token subdivisionScheme = "none"
    point3f[] points = ${tuples(geometry.points)}
    int[] faceVertexCounts = ${list(geometry.counts)}
    int[] faceVertexIndices = ${list(geometry.indices)}
    normal3f[] normals = ${tuples(geometry.normals)} (interpolation = "vertex")
    rel material:binding = </GyroLoader/GyroMaterial>
  }
}`;
  }).join("\n");
  const model = `#usda 1.0
(
  defaultPrim = "GyroLoader"
  metersPerUnit = 1
  upAxis = "Y"
  startTimeCode = 0
  endTimeCode = ${end}
  framesPerSecond = ${s.fps}
  timeCodesPerSecond = ${s.fps}
  playbackMode = "loop"
  autoPlay = true
)
def Xform "GyroLoader" {
  ${materialDefinition("GyroLoader", "GyroMaterial", diffuse, material)}
  ${rings}
}`;
  const data = strToU8(model),
    name = "model.usda";
  return {
    bytes: alignedUsdz([{ name, data }]),
    frames,
  };
}

const rgba = (value: string) => {
  const hex = value.replace("#", "");
  const normalized = hex.length === 3
    ? hex.split("").map((part) => part + part).join("") + "FF"
    : hex.length === 6 ? `${hex}FF` : hex.padEnd(8, "F").slice(0, 8);
  return {
    color: linearRgb(`#${normalized.slice(0, 6)}`),
    alpha: Number.parseInt(normalized.slice(6, 8), 16) / 255,
  };
};

const textTexture = async (
  text: string,
  settings: FrostedTypeBandUsdzSettings["frostedTypeBand"],
) => {
  const scale = 4;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建文字纹理画布");
  const font = `${settings.fontStyle} ${settings.fontWeight} ${settings.fontSize * scale}px ${settings.fontFamily}`;
  context.font = font;
  const letterSpacing = settings.letterSpacing * settings.fontSize * scale;
  const characters = Array.from(text);
  const measured = characters.reduce(
    (sum, character) => sum + context.measureText(character).width,
    Math.max(0, characters.length - 1) * letterSpacing,
  );
  canvas.width = Math.max(8, Math.ceil(measured + settings.fontSize * scale));
  canvas.height = Math.max(8, Math.ceil(settings.fontSize * scale * 1.8));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = font;
  context.textBaseline = "middle";
  context.fillStyle = settings.textColor;
  let x = settings.fontSize * scale * 0.5;
  for (const character of characters) {
    context.fillText(character, x, canvas.height / 2);
    x += context.measureText(character).width + letterSpacing;
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("文字纹理编码失败")), "image/png"),
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), aspect: canvas.width / canvas.height };
};

export async function buildFrostedTypeBandUsdz(
  s: FrostedTypeBandUsdzSettings,
  textureOverride?: { bytes: Uint8Array; aspect: number }[],
) {
  const settings = s.frostedTypeBand;
  const labels = settings.items.split("|").map((item) => item.trim()).filter(Boolean);
  if (!labels.length) throw new Error("至少需要一段环形文字");
  const frames = Math.max(1, Math.round((s.duration + s.delay) * s.fps));
  const end = frames - 1;
  const textures = textureOverride ?? await Promise.all(labels.map((label) => textTexture(label, settings)));
  if (textures.length !== labels.length) throw new Error("文字纹理数量与文字段数不一致");
  const radius = Math.max(0.8, settings.distance / 260);
  const height = Math.max(0.12, settings.fontSize / 55);
  const speedTurns = Math.max(0, settings.speed) / 100;
  const samples = `{${Array.from({ length: frames }, (_, frame) => {
    const elapsed = Math.max(0, frame / s.fps - s.delay);
    const progress = s.duration > 0 ? elapsed / s.duration : 0;
    return `${frame}: ${(-360 * speedTurns * progress).toFixed(6)}`;
  }).join(",")}}`;
  const tint = rgba(settings.tint);
  const bandGeometry = geometry(96);
  bandGeometry.points.forEach((point) => {
    point[0] *= radius;
    point[1] *= height * 2.4;
    point[2] *= radius;
  });
  const words = labels.map((label, index) => {
    const angle = (index / labels.length) * TAU;
    const width = Math.max(height, height * textures[index].aspect);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const rotation = (angle * 180) / Math.PI;
    const asset = `textures/word-${index + 1}.png`;
    return `def Xform "Word${index + 1}" {
      double3 xformOp:translate = (${x.toFixed(6)}, 0, ${z.toFixed(6)})
      double xformOp:rotateY = ${rotation.toFixed(6)}
      uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateY"]
      def Material "TextMaterial" {
        token outputs:surface.connect = <TextMaterial/Surface.outputs:surface>
        def Shader "Surface" {
          uniform token info:id = "UsdPreviewSurface"
          color3f inputs:diffuseColor.connect = <TextMaterial/Texture.outputs:rgb>
          float inputs:opacity.connect = <TextMaterial/Texture.outputs:a>
          float inputs:metallic = 0
          float inputs:roughness = 0.28
          token outputs:surface
        }
        def Shader "Texture" {
          uniform token info:id = "UsdUVTexture"
          asset inputs:file = @${asset}@
          token inputs:sourceColorSpace = "sRGB"
          float2 inputs:st.connect = <TextMaterial/Primvar.outputs:result>
          float3 outputs:rgb
          float outputs:a
        }
        def Shader "Primvar" {
          uniform token info:id = "UsdPrimvarReader_float2"
          token inputs:varname = "st"
          float2 outputs:result
        }
      }
      def Mesh "TextCard" (prepend apiSchemas = ["MaterialBindingAPI"]) {
        uniform token subdivisionScheme = "none"
        point3f[] points = [(${(-width / 2).toFixed(6)},${(-height / 2).toFixed(6)},0),(${(width / 2).toFixed(6)},${(-height / 2).toFixed(6)},0),(${(width / 2).toFixed(6)},${(height / 2).toFixed(6)},0),(${(-width / 2).toFixed(6)},${(height / 2).toFixed(6)},0)]
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0,1,2,3]
        texCoord2f[] primvars:st = [(0,0),(1,0),(1,1),(0,1)] (interpolation = "vertex")
        rel material:binding = <../TextMaterial>
      }
    }`;
  }).join("\n");
  const model = `#usda 1.0
(
  defaultPrim = "FrostedTypeBand"
  metersPerUnit = 1
  upAxis = "Y"
  startTimeCode = 0
  endTimeCode = ${end}
  framesPerSecond = ${s.fps}
  timeCodesPerSecond = ${s.fps}
  playbackMode = "loop"
  autoPlay = true
)
def Xform "FrostedTypeBand" {
  double xformOp:rotateZ = ${settings.tilt.toFixed(6)}
  uniform token[] xformOpOrder = ["xformOp:rotateZ"]
  def Material "GlassMaterial" {
    token outputs:surface.connect = <GlassMaterial/Surface.outputs:surface>
    def Shader "Surface" {
      uniform token info:id = "UsdPreviewSurface"
      color3f inputs:diffuseColor = (${tint.color.map((value) => value.toFixed(6)).join(",")})
      float inputs:opacity = ${Math.max(0.04, Math.min(0.5, tint.alpha)).toFixed(4)}
      float inputs:roughness = ${(1 - settings.refraction / 140).toFixed(4)}
      float inputs:ior = ${(1.05 + settings.refraction / 100).toFixed(4)}
      token outputs:surface
    }
  }
  def Xform "Ring" {
    double xformOp:rotateY.timeSamples = ${samples}
    uniform token[] xformOpOrder = ["xformOp:rotateY"]
    def Mesh "GlassBand" (prepend apiSchemas = ["MaterialBindingAPI"]) {
      uniform token subdivisionScheme = "none"
      point3f[] points = ${tuples(bandGeometry.points)}
      int[] faceVertexCounts = ${list(bandGeometry.counts)}
      int[] faceVertexIndices = ${list(bandGeometry.indices)}
      normal3f[] normals = ${tuples(bandGeometry.normals)} (interpolation = "vertex")
      rel material:binding = </FrostedTypeBand/GlassMaterial>
    }
    ${words}
  }
}`;
  return {
    bytes: alignedUsdz([
      { name: "model.usda", data: strToU8(model) },
      ...textures.map((texture, index) => ({ name: `textures/word-${index + 1}.png`, data: texture.bytes })),
    ]),
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
