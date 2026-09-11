import { useEffect, useRef, type CSSProperties } from "react";
import { DEFAULT_APPEARANCE, type SurfaceAppearance } from "../appearance";
import { DEFAULT_DISC_CURVE, evaluateDiscCurve, type DiscCurveSettings } from "../disc-curve";

type RGB = [number, number, number];
type Matrix4 = Float32Array;

export type DiscSplitProps = {
  background?: string;
  baseColor: string;
  accentColor: string;
  speed: number;
  distance: number;
  timeSeconds: number;
  loopDuration: number;
  disc?: {
    count: number;
    proportions?: number[];
    curve?: DiscCurveSettings;
    innerRadius: number;
    thickness: number;
    burst: number;
  };
  style?: CSSProperties;
  appearance?: SurfaceAppearance;
};

const TAU = Math.PI * 2;
export const DEFAULT_DISC_PROPORTIONS = Array.from({ length: 6 }, () => 1 / 6);
const DEFAULT_DISC = { count: 6, innerRadius: 31, thickness: 90, burst: 71, proportions: DEFAULT_DISC_PROPORTIONS };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseColor(value: string | undefined, fallback: RGB): RGB {
  const match = /^#([0-9a-f]{6})$/i.exec(value?.trim() ?? "");
  if (!match) return fallback;
  const hex = Number.parseInt(match[1], 16);
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
}

function identity(): Matrix4 {
  const result = new Float32Array(16);
  result[0] = result[5] = result[10] = result[15] = 1;
  return result;
}

function multiply(left: Matrix4, right: Matrix4): Matrix4 {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    const a = right[column * 4];
    const b = right[column * 4 + 1];
    const c = right[column * 4 + 2];
    const d = right[column * 4 + 3];
    result[column * 4] = left[0] * a + left[4] * b + left[8] * c + left[12] * d;
    result[column * 4 + 1] =
      left[1] * a + left[5] * b + left[9] * c + left[13] * d;
    result[column * 4 + 2] =
      left[2] * a + left[6] * b + left[10] * c + left[14] * d;
    result[column * 4 + 3] =
      left[3] * a + left[7] * b + left[11] * c + left[15] * d;
  }
  return result;
}

function translation(x: number, y: number, z: number): Matrix4 {
  const result = identity();
  result[12] = x;
  result[13] = y;
  result[14] = z;
  return result;
}

function rotationX(angle: number): Matrix4 {
  const result = identity(),
    cosine = Math.cos(angle),
    sine = Math.sin(angle);
  result[5] = cosine;
  result[6] = sine;
  result[9] = -sine;
  result[10] = cosine;
  return result;
}

function rotationY(angle: number): Matrix4 {
  const result = identity(),
    cosine = Math.cos(angle),
    sine = Math.sin(angle);
  result[0] = cosine;
  result[2] = -sine;
  result[8] = sine;
  result[10] = cosine;
  return result;
}

function rotationZ(angle: number): Matrix4 {
  const result = identity(),
    cosine = Math.cos(angle),
    sine = Math.sin(angle);
  result[0] = cosine;
  result[1] = sine;
  result[4] = -sine;
  result[5] = cosine;
  return result;
}

function scale(value: number): Matrix4 {
  const result = identity();
  result[0] = result[5] = result[10] = value;
  return result;
}

function perspective(aspect: number): Matrix4 {
  const near = 0.1,
    far = 200,
    f = 1 / Math.tan((45 * Math.PI) / 360);
  const result = new Float32Array(16);
  result[0] = f / aspect;
  result[5] = f;
  result[10] = (far + near) / (near - far);
  result[11] = -1;
  result[14] = (2 * far * near) / (near - far);
  return result;
}

function normalMatrix(model: Matrix4) {
  const a = model[0],
    b = model[1],
    c = model[2],
    d = model[4],
    e = model[5],
    f = model[6],
    g = model[8],
    h = model[9],
    i = model[10];
  const x = e * i - h * f,
    y = -(b * i - h * c),
    z = b * f - e * c;
  const determinant = a * x + d * y + g * z;
  if (!determinant) return new Float32Array([a, b, c, d, e, f, g, h, i]);
  const inverse = 1 / determinant;
  return new Float32Array([
    x * inverse,
    -(d * i - g * f) * inverse,
    (d * h - g * e) * inverse,
    y * inverse,
    (a * i - g * c) * inverse,
    -(a * h - g * b) * inverse,
    z * inverse,
    -(a * f - d * c) * inverse,
    (a * e - d * b) * inverse,
  ]);
}

function wedgeGeometry(
  count: number,
  innerRadius: number,
  thickness: number,
  segments = 32,
  proportions?: number[],
) {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [],
    pieceRanges: Array<{ offset: number; count: number }> = [];
  const normalized = proportions?.length === count
    ? proportions.map((value) => Math.max(0, value))
    : Array.from({ length: count }, () => 1);
  const spans = proportions?.length === count
    ? normalized.map((value) => TAU * value)
    : normalized.map(() => TAU / count);
  const vertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
  ) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    return positions.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) =>
    indices.push(a, b, c, a, c, d);
  for (let piece = 0; piece < count; piece += 1) {
    const angleSpan = spans[piece];
    const indexOffset = indices.length;
    for (let step = 0; step < segments; step += 1) {
    const start = (step / segments) * angleSpan,
      end = ((step + 1) / segments) * angleSpan;
    const cs = Math.cos(start),
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
    const cosine = Math.cos(angle),
      sine = Math.sin(angle),
      nx = sign * -sine,
      ny = sign * cosine;
    const a = vertex(innerRadius * cosine, innerRadius * sine, 0, nx, ny, 0);
    const b = vertex(cosine, sine, 0, nx, ny, 0);
    const c = vertex(cosine, sine, thickness, nx, ny, 0);
    const d = vertex(
      innerRadius * cosine,
      innerRadius * sine,
      thickness,
      nx,
      ny,
      0,
    );
    sign > 0 ? quad(a, b, c, d) : quad(d, c, b, a);
    };
    radial(0, 1);
    radial(angleSpan, -1);
    pieceRanges.push({ offset: indexOffset, count: indices.length - indexOffset });
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
    pieceRanges,
  };
}

const vertexShader = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aNrm;
uniform mat4 uMVP;
uniform mat3 uNM;
varying vec3 vN;
varying vec3 vP;
void main() { vN = uNM * aNrm; vP = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }
`;

const fragmentShader = `
precision highp float;
varying vec3 vN;
varying vec3 vP;
uniform vec3 uBase;
uniform vec3 uAcc;
uniform float uMetallic;
uniform float uRoughness;
uniform float uOpacity;
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform float uHasFront;
uniform float uHasBack;
const vec3 KEY = vec3(-0.4364, 0.4601, 0.7733);
const vec3 FILL = vec3(0.7831, 0.1309, 0.6080);
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float k = max(dot(n, KEY), 0.0);
  float f = max(dot(n, FILL), 0.0);
  float graze = 1.0 - clamp(abs(n.z), 0.0, 1.0);
  float shine = mix(3.0, 18.0, 1.0 - uRoughness);
  vec3 diffuse = uBase * (0.18 + 0.72 * k + 0.18 * f) * (1.0 - 0.72 * uMetallic);
  vec3 metal = uBase * (0.07 + 0.64 * pow(k, 2.0));
  vec3 c = mix(diffuse, metal, uMetallic);
  c += uAcc * mix(0.22, 0.92, uMetallic) * pow(k, shine);
  c += uAcc * 0.28 * pow(graze, mix(1.5, 4.0, 1.0 - uRoughness));
  vec2 uv = vec2(vP.x * 0.5 + 0.5, vP.y * 0.5 + 0.5);
  if (vP.z > 0.0001 && uHasFront > 0.5) c = texture2D(uFront, uv).rgb * (0.45 + 0.55 * max(k, 0.25)) + uAcc * 0.18 * pow(k, shine);
  if (vP.z < 0.0001 && uHasBack > 0.5) c = texture2D(uBack, vec2(1.0 - uv.x, uv.y)).rgb * (0.45 + 0.55 * max(k, 0.25)) + uAcc * 0.18 * pow(k, shine);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), uOpacity);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("无法创建 Disc Split Shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "Disc Split Shader 编译失败",
    );
  return shader;
}

export default function DiscSplit({
  background = "transparent",
  baseColor,
  accentColor,
  speed,
  distance,
  timeSeconds,
  loopDuration,
  disc,
  style,
  appearance = DEFAULT_APPEARANCE,
}: DiscSplitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef({
    baseColor,
    accentColor,
    speed,
    distance,
        disc: { ...DEFAULT_DISC, ...disc, proportions: disc?.proportions ?? DEFAULT_DISC_PROPORTIONS, curve: disc?.curve ?? DEFAULT_DISC_CURVE },
    timeSeconds,
    appearance,
  });
  liveRef.current = {
    baseColor,
    accentColor,
    speed,
    distance,
        disc: { ...DEFAULT_DISC, ...disc, proportions: disc?.proportions ?? DEFAULT_DISC_PROPORTIONS, curve: disc?.curve ?? DEFAULT_DISC_CURVE },
    timeSeconds,
    appearance,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      depth: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("当前环境无法创建 Disc Split WebGL 上下文");
    const program = gl.createProgram();
    if (!program) throw new Error("无法创建 Disc Split Program");
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShader),
      fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "Disc Split 链接失败");
    const aPos = gl.getAttribLocation(program, "aPos"),
      aNrm = gl.getAttribLocation(program, "aNrm");
    const uMVP = gl.getUniformLocation(program, "uMVP"),
      uNM = gl.getUniformLocation(program, "uNM");
    const uBase = gl.getUniformLocation(program, "uBase"),
      uAcc = gl.getUniformLocation(program, "uAcc"),
      uMetallic = gl.getUniformLocation(program, "uMetallic"),
      uRoughness = gl.getUniformLocation(program, "uRoughness"),
      uOpacity = gl.getUniformLocation(program, "uOpacity");
    const uFront = gl.getUniformLocation(program, "uFront"),
      uBack = gl.getUniformLocation(program, "uBack"),
      uHasFront = gl.getUniformLocation(program, "uHasFront"),
      uHasBack = gl.getUniformLocation(program, "uHasBack");
    const positionBuffer = gl.createBuffer(),
      normalBuffer = gl.createBuffer(),
      indexBuffer = gl.createBuffer();
    if (
      !uMVP ||
      !uNM ||
      !uBase ||
      !uAcc ||
      !uMetallic ||
      !uRoughness ||
      !uOpacity ||
      !uFront ||
      !uBack ||
      !uHasFront ||
      !uHasBack ||
      !positionBuffer ||
      !normalBuffer ||
      !indexBuffer
    )
      throw new Error("Disc Split WebGL 初始化失败");
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);
    const makeTexture = (unit: number, source?: string) => {
      const texture = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      if (source) {
        const image = new Image();
        image.onload = () => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          draw();
        };
        image.src = source;
      }
      return texture;
    };
    const frontTexture = makeTexture(0, appearance.frontTexture),
      backTexture = makeTexture(1, appearance.backTexture);
    gl.uniform1i(uFront, 0);
    gl.uniform1i(uBack, 1);
    gl.uniform1f(uHasFront, appearance.enabled && appearance.frontTexture ? 1 : 0);
    gl.uniform1f(uHasBack, appearance.enabled && appearance.backTexture ? 1 : 0);
    let geometryKey = "",
      pieceRanges: Array<{ offset: number; count: number }> = [];
    const resize = () => {
      const dpr =
        document.documentElement.dataset.render === "frame"
          ? 1
          : Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr)),
        height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };
    const draw = () => {
      resize();
      const settings = liveRef.current,
        pieceCount = Math.max(2, Math.round(settings.disc.count));
      const thickness = (0.3 * clamp(settings.disc.thickness, 10, 400)) / 100;
      const innerRadius = clamp(settings.disc.innerRadius, 0, 90) / 100;
      const proportions = settings.disc.proportions?.length === pieceCount ? settings.disc.proportions : undefined;
      const nextGeometryKey = `${pieceCount}|${innerRadius.toFixed(4)}|${thickness.toFixed(4)}|${proportions?.join(",") ?? ""}`;
      if (geometryKey !== nextGeometryKey) {
        geometryKey = nextGeometryKey;
        const geometry = wedgeGeometry(pieceCount, innerRadius, thickness, 32, proportions);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(
          gl.ELEMENT_ARRAY_BUFFER,
          geometry.indices,
          gl.STATIC_DRAW,
        );
        pieceRanges = geometry.pieceRanges;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
      gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      const material = settings.appearance.enabled
        ? settings.appearance.material
        : { ...settings.appearance.material, color: settings.baseColor, metallic: 1, roughness: 0.2, opacity: 1 };
      gl.uniform3fv(uBase, parseColor(material.color, [0.56, 0.6, 0.65]));
      gl.uniform3fv(uAcc, parseColor(settings.accentColor, [1, 1, 1]));
      gl.uniform1f(uMetallic, material.metallic);
      gl.uniform1f(uRoughness, material.roughness);
      gl.uniform1f(uOpacity, material.opacity);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const aspect = canvas.width / canvas.height;
      const pv = multiply(
        perspective(aspect),
        translation(0, 0, -settings.distance / Math.min(1, aspect)),
      );
      const fallbackDuration =
        150 / Math.max(0.001, clamp(settings.speed, 0, 100));
      const cycleDuration = loopDuration > 0 ? loopDuration : fallbackDuration;
      const phase =
        ((((settings.timeSeconds / cycleDuration) * 3) % 3) + 3) % 3;
      const curve = settings.disc.curve ?? DEFAULT_DISC_CURVE;
      const returnStart = evaluateDiscCurve(1 / 1.5, curve);
      const burst =
        phase < 1
          ? evaluateDiscCurve(Math.min(1, phase / 1.5), curve)
          : returnStart *
            (1 - evaluateDiscCurve(Math.min(1, (phase - 1) / 1.5), curve));
      const turn = TAU * evaluateDiscCurve(Math.min(1, phase / 2), curve);
      const radialDistance = (0.5 * clamp(settings.disc.burst, 0, 300)) / 100;
      const equalShare = 1 / pieceCount;
      const customSplit = proportions && proportions.some((value) => Math.abs(value - equalShare) > 0.0001);
      const pieceSpans = proportions
        ? proportions.map((value) => TAU * Math.max(0, value))
        : Array.from({ length: pieceCount }, () => TAU / pieceCount);
      let pieceAngle = customSplit ? Math.PI : 0;
      for (let index = 0; index < pieceCount; index += 1) {
        const angle = pieceAngle;
        let model = scale(1.6);
        model = multiply(model, translation(0, 0, thickness / 2));
        model = multiply(model, rotationX(Math.PI / 2));
        model = multiply(
          model,
          translation(
            Math.sin(angle) * radialDistance * burst,
            0,
            Math.cos(angle) * radialDistance * burst,
          ),
        );
        model = multiply(model, rotationY(angle));
        model = multiply(model, rotationZ(turn));
        model = multiply(model, rotationX(Math.PI / 2));
        gl.uniformMatrix4fv(uMVP, false, multiply(pv, model));
        gl.uniformMatrix3fv(uNM, false, normalMatrix(model));
        const range = pieceRanges[index];
        gl.drawElements(gl.TRIANGLES, range.count, gl.UNSIGNED_SHORT, range.offset * Uint16Array.BYTES_PER_ELEMENT);
        pieceAngle += pieceSpans[index];
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    let animationFrame = 0;
    const animate = () => {
      draw();
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(normalBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteProgram(program);
      gl.deleteTexture(frontTexture);
      gl.deleteTexture(backTexture);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [loopDuration, appearance.enabled, appearance.frontTexture, appearance.backTexture]);

  return (
    <div className="motion-root" style={{ background, ...style }}>
      <canvas
        ref={canvasRef}
        data-testid="disc-split-canvas"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
    </div>
  );
}
