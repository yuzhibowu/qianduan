import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { evaluateCoinMotion, TAU } from "../time";
import { DEFAULT_APPEARANCE, type SurfaceAppearance } from "../appearance";

type RGB = [number, number, number];
type M4 = Float32Array;

interface CoinsGroup {
  count: number;
  coinSize: number;
  spread: number;
  ringSpeed: number;
}

interface Props {
  background?: string;
  baseColor?: string;
  accentColor?: string;
  speed?: number;
  distance?: number;
  coins?: Partial<CoinsGroup>;
  timeSeconds: number;
  loopDuration?: number;
  style?: CSSProperties;
  appearance?: SurfaceAppearance;
}

const DEFAULT_COINS: CoinsGroup = {
  count: 8,
  coinSize: 100,
  spread: 100,
  ringSpeed: 50,
};
const FOV = (45 * Math.PI) / 180;

export function parseColor(value: string | undefined, fallback: RGB): RGB {
  if (!value) return fallback;
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return fallback;
  const number = Number.parseInt(match[1], 16);
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
  ];
}

export function identity(): M4 {
  const out = new Float32Array(16);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function multiply(a: M4, b: M4): M4 {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    const b0 = b[column * 4];
    const b1 = b[column * 4 + 1];
    const b2 = b[column * 4 + 2];
    const b3 = b[column * 4 + 3];
    out[column * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[column * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[column * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[column * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function rotationX(angle: number): M4 {
  const out = identity();
  const c = Math.cos(angle),
    s = Math.sin(angle);
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
}

export function rotationY(angle: number): M4 {
  const out = identity();
  const c = Math.cos(angle),
    s = Math.sin(angle);
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
}

export function rotationZ(angle: number): M4 {
  const out = identity();
  const c = Math.cos(angle),
    s = Math.sin(angle);
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
}

export function translation(x: number, y: number, z: number): M4 {
  const out = identity();
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out;
}

export function scale(value: number): M4 {
  const out = identity();
  out[0] = out[5] = out[10] = value;
  return out;
}

export function perspective(aspect: number): M4 {
  const near = 0.1,
    far = 200,
    f = 1 / Math.tan(FOV / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function normalMatrix(model: M4): Float32Array {
  return new Float32Array([
    model[0],
    model[1],
    model[2],
    model[4],
    model[5],
    model[6],
    model[8],
    model[9],
    model[10],
  ]);
}

function cylinderGeometry(segments = 64) {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  const radius = 1,
    height = 0.1,
    half = height / 2;
  for (let row = 0; row <= 1; row += 1) {
    const y = row === 0 ? half : -half;
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * TAU;
      const x = Math.sin(angle),
        z = Math.cos(angle);
      positions.push(radius * x, y, radius * z);
      normals.push(x, 0, z);
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const a = index,
      d = index + 1,
      b = segments + 1 + index,
      c = b + 1;
    indices.push(a, b, d, b, c, d);
  }
  const addCap = (top: boolean) => {
    const y = top ? half : -half;
    const center = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, top ? 1 : -1, 0);
    for (let index = 0; index <= segments; index += 1) {
      const angle = (index / segments) * TAU;
      positions.push(Math.sin(angle), y, Math.cos(angle));
      normals.push(0, top ? 1 : -1, 0);
    }
    for (let index = 0; index < segments; index += 1) {
      const p0 = center + 1 + index,
        p1 = p0 + 1;
      indices.push(center, top ? p0 : p1, top ? p1 : p0);
    }
  };
  addCap(true);
  addCap(false);
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

export const vertexShader = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aNrm;
uniform mat4 uMVP;
uniform mat3 uNM;
varying vec3 vN;
varying vec3 vP;
void main() { vN = uNM * aNrm; vP = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }
`;

// This is OriginKit's procedural two-lobe chrome matcap shader.
export const fragmentShader = `
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
  float k = max(dot(n, KEY), 0.0);
  float f = max(dot(n, FILL), 0.0);
  float graze = 1.0 - clamp(abs(n.z), 0.0, 1.0);
  float shine = mix(3.0, 18.0, 1.0 - uRoughness);
  vec3 diffuse = uBase * (0.18 + 0.72 * k + 0.18 * f) * (1.0 - 0.72 * uMetallic);
  vec3 metal = uBase * (0.07 + 0.64 * pow(k, 2.0));
  vec3 c = mix(diffuse, metal, uMetallic);
  c += uAcc * mix(0.22, 0.92, uMetallic) * pow(k, shine);
  c += uAcc * 0.28 * pow(graze, mix(1.5, 4.0, 1.0 - uRoughness));
  vec2 uv = vec2(vP.x * 0.5 + 0.5, vP.z * 0.5 + 0.5);
  if (vP.y > 0.049 && uHasFront > 0.5) c = texture2D(uFront, uv).rgb * (0.45 + 0.55 * max(k, 0.25)) + uAcc * 0.18 * pow(k, shine);
  if (vP.y < -0.049 && uHasBack > 0.5) c = texture2D(uBack, vec2(1.0 - uv.x, uv.y)).rgb * (0.45 + 0.55 * max(k, 0.25)) + uAcc * 0.18 * pow(k, shine);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), uOpacity);
}
`;

export function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("无法创建 WebGL Shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader) ?? "Shader 编译失败");
  return shader;
}

export default function CoinLoader({
  background = "#0C0C0C",
  baseColor = "#FFFFFF",
  accentColor = "#FFFFFF",
  speed = 100,
  distance = 20,
  coins,
  timeSeconds,
  loopDuration = TAU / 0.6,
  style,
  appearance = DEFAULT_APPEARANCE,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<((time: number) => void) | null>(null);
  const liveRef = useRef({
    baseColor,
    accentColor,
    speed,
    distance,
    coins: { ...DEFAULT_COINS, ...coins },
    appearance,
    timeSeconds,
  });
  liveRef.current = {
    baseColor,
    accentColor,
    speed,
    distance,
    coins: { ...DEFAULT_COINS, ...coins },
    appearance,
    timeSeconds,
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
    if (!gl) throw new Error("当前环境无法创建 WebGL1 上下文");
    const program = gl.createProgram();
    if (!program) throw new Error("无法创建 WebGL Program");
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShader),
      fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "WebGL 链接失败");

    const geometry = cylinderGeometry();
    const positionBuffer = gl.createBuffer(),
      normalBuffer = gl.createBuffer(),
      indexBuffer = gl.createBuffer();
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
    if (
      !positionBuffer ||
      !normalBuffer ||
      !indexBuffer ||
      !uMVP ||
      !uNM ||
      !uBase ||
      !uAcc
      || !uMetallic || !uRoughness || !uOpacity || !uFront || !uBack || !uHasFront || !uHasBack
    )
      throw new Error("Coin Loader WebGL 初始化失败");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aNrm);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
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
          renderRef.current?.(liveRef.current.timeSeconds ?? 0);
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

    const resize = () => {
      const dpr =
        document.documentElement.dataset.render === "frame"
          ? 1
          : Math.min(devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    renderRef.current = (absoluteTime) => {
      resize();
      const settings = liveRef.current;
      const count = Math.max(1, Math.round(settings.coins.count));
      const { tumble, ringPhase } = evaluateCoinMotion(
        absoluteTime,
        settings.speed,
        settings.coins.ringSpeed,
        loopDuration,
      );
      const aspect = canvas.width / canvas.height;
      const viewDistance = settings.distance / Math.min(1, aspect);
      const pv = multiply(
        perspective(aspect),
        translation(0, 0, -viewDistance),
      );
      const material = settings.appearance.enabled
        ? settings.appearance.material
        : { ...settings.appearance.material, color: settings.baseColor, metallic: 1, roughness: 0.2, opacity: 1 };
      gl.uniform3fv(uBase, parseColor(material.color, [0.56, 0.6, 0.65]));
      gl.uniform3fv(uAcc, parseColor(settings.accentColor, [1, 1, 1]));
      gl.uniform1f(uMetallic, material.metallic);
      gl.uniform1f(uRoughness, material.roughness);
      gl.uniform1f(uOpacity, material.opacity);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * TAU;
        const positionAngle = angle + TAU / count;
        let model = rotationZ(-ringPhase);
        model = multiply(model, scale(0.6));
        model = multiply(
          model,
          translation(
            (Math.cos(positionAngle) * 3 * settings.coins.spread) / 100,
            (Math.sin(positionAngle) * 3 * settings.coins.spread) / 100,
            0,
          ),
        );
        model = multiply(model, rotationZ(angle));
        model = multiply(model, rotationX(tumble));
        model = multiply(model, rotationY(Math.PI / count + tumble));
        model = multiply(model, rotationZ(Math.PI / 2 + tumble));
        model = multiply(model, scale(settings.coins.coinSize / 100));
        gl.uniformMatrix4fv(uMVP, false, multiply(pv, model));
        gl.uniformMatrix3fv(uNM, false, normalMatrix(model));
        gl.drawElements(
          gl.TRIANGLES,
          geometry.indices.length,
          gl.UNSIGNED_SHORT,
          0,
        );
      }
      gl.finish();
      canvas.dataset.renderedTime = absoluteTime.toFixed(6);
    };

    renderRef.current(timeSeconds);
    return () => {
      renderRef.current = null;
      observer.disconnect();
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(normalBuffer);
      gl.deleteBuffer(indexBuffer);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
      gl.deleteTexture(frontTexture);
      gl.deleteTexture(backTexture);
    };
  }, [loopDuration, appearance.enabled, appearance.frontTexture, appearance.backTexture]);

  useEffect(() => {
    renderRef.current?.(timeSeconds);
  }, [timeSeconds, speed, distance, baseColor, accentColor, coins, appearance]);

  useEffect(() => {
    window.__originKitRenderAt = (absoluteTime: number) =>
      renderRef.current?.(absoluteTime);
    return () => {
      delete window.__originKitRenderAt;
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 1,
        minHeight: 1,
        background,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="coin-loader-canvas"
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

declare global {
  interface Window {
    __originKitRenderAt?: (absoluteTime: number) => void;
  }
}
