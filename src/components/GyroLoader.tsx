import { useEffect, useRef } from "react";
import {
  compile,
  fragmentShader,
  multiply,
  normalMatrix,
  parseColor,
  perspective,
  rotationX,
  rotationY,
  translation,
  vertexShader,
} from "./CoinLoader";
import { DEFAULT_APPEARANCE, type SurfaceAppearance } from "../appearance";

type Props = {
  background?: string;
  baseColor: string;
  accentColor: string;
  speed: number;
  distance: number;
  coins?: {
    count: number;
    coinSize: number;
    spread: number;
    ringSpeed: number;
  };
  timeSeconds: number;
  loopDuration: number;
  appearance?: SurfaceAppearance;
};

const TAU = Math.PI * 2;
const DEFAULT_RINGS = { count: 4, coinSize: 100, spread: 150, ringSpeed: 500 };

function torusGeometry(
  radius: number,
  tube: number,
  radialSegments = 20,
  tubularSegments = 80,
) {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  for (let radial = 0; radial <= radialSegments; radial += 1) {
    const v = (radial / radialSegments) * TAU,
      cosineV = Math.cos(v),
      sineV = Math.sin(v);
    for (let tubular = 0; tubular <= tubularSegments; tubular += 1) {
      const u = (tubular / tubularSegments) * TAU,
        cosineU = Math.cos(u),
        sineU = Math.sin(u);
      positions.push(
        (radius + tube * cosineV) * sineU,
        (radius + tube * cosineV) * cosineU,
        tube * sineV,
      );
      normals.push(cosineV * sineU, cosineV * cosineU, sineV);
    }
  }
  for (let radial = 1; radial <= radialSegments; radial += 1) {
    for (let tubular = 1; tubular <= tubularSegments; tubular += 1) {
      const a = (tubularSegments + 1) * radial + tubular - 1;
      const b = (tubularSegments + 1) * (radial - 1) + tubular - 1;
      const c = (tubularSegments + 1) * (radial - 1) + tubular;
      const d = (tubularSegments + 1) * radial + tubular;
      indices.push(a, b, d, b, c, d);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  };
}

const easeInOut = (value: number) =>
  value < 0.5 ? 2 * value * value : 1 - 2 * (1 - value) ** 2;

export default function GyroLoader({
  background = "transparent",
  baseColor,
  accentColor,
  distance,
  coins,
  timeSeconds,
  loopDuration,
  appearance = DEFAULT_APPEARANCE,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<((time: number) => void) | null>(null);
  const liveRef = useRef({
    baseColor,
    accentColor,
    distance,
    rings: { ...DEFAULT_RINGS, ...coins },
    appearance,
  });
  liveRef.current = {
    baseColor,
    accentColor,
    distance,
    rings: { ...DEFAULT_RINGS, ...coins },
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
    if (!gl) throw new Error("当前环境无法创建 Gyro Loader WebGL 上下文");
    const program = gl.createProgram();
    if (!program) throw new Error("无法创建 Gyro Loader Program");
    const vs = compile(gl, gl.VERTEX_SHADER, vertexShader),
      fs = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? "Gyro Loader 链接失败");
    const aPos = gl.getAttribLocation(program, "aPos"),
      aNrm = gl.getAttribLocation(program, "aNrm");
    const uMVP = gl.getUniformLocation(program, "uMVP"),
      uNM = gl.getUniformLocation(program, "uNM");
    const uBase = gl.getUniformLocation(program, "uBase"),
      uAcc = gl.getUniformLocation(program, "uAcc"),
      uMetallic = gl.getUniformLocation(program, "uMetallic"),
      uRoughness = gl.getUniformLocation(program, "uRoughness"),
      uOpacity = gl.getUniformLocation(program, "uOpacity");
    if (!uMVP || !uNM || !uBase || !uAcc || !uMetallic || !uRoughness || !uOpacity)
      throw new Error("Gyro Loader 初始化失败");
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LEQUAL);
    gl.clearColor(0, 0, 0, 0);
    let buffers: {
        position: WebGLBuffer;
        normal: WebGLBuffer;
        index: WebGLBuffer;
        count: number;
      }[] = [],
      geometryKey = "";
    const rebuild = (count: number, thickness: number) => {
      const key = `${count}|${thickness.toFixed(4)}`;
      if (key === geometryKey) return;
      geometryKey = key;
      buffers.forEach((buffer) => {
        gl.deleteBuffer(buffer.position);
        gl.deleteBuffer(buffer.normal);
        gl.deleteBuffer(buffer.index);
      });
      buffers = Array.from({ length: count }, (_, index) => {
        const geometry = torusGeometry((index + 1) * 0.5, thickness);
        const position = gl.createBuffer()!,
          normal = gl.createBuffer()!,
          element = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, position);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, normal);
        gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, element);
        gl.bufferData(
          gl.ELEMENT_ARRAY_BUFFER,
          geometry.indices,
          gl.STATIC_DRAW,
        );
        return {
          position,
          normal,
          index: element,
          count: geometry.indices.length,
        };
      });
    };
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
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    renderRef.current = (absoluteTime) => {
      resize();
      const settings = liveRef.current,
        count = Math.max(1, Math.round(settings.rings.count));
      rebuild(count, (0.1 * settings.rings.coinSize) / 100);
      const aspect = canvas.width / canvas.height,
        pv = multiply(
          perspective(aspect),
          translation(0, 0, -settings.distance / Math.min(1, aspect)),
        );
      const cycle = Math.max(0.001, loopDuration),
        phase = ((absoluteTime % cycle) + cycle) % cycle;
      const stagger = settings.rings.spread / 1000,
        pause = settings.rings.ringSpeed / 1000;
      const motion = Math.max(0.001, cycle - stagger * (count - 1) - pause);
      const material = settings.appearance.enabled
        ? settings.appearance.material
        : { ...settings.appearance.material, color: settings.baseColor, metallic: 1, roughness: 0.2, opacity: 1 };
      gl.uniform3fv(uBase, parseColor(material.color, [0.56, 0.6, 0.65]));
      gl.uniform3fv(uAcc, parseColor(settings.accentColor, [1, 1, 1]));
      gl.uniform1f(uMetallic, material.metallic);
      gl.uniform1f(uRoughness, material.roughness);
      gl.uniform1f(uOpacity, material.opacity);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      buffers.forEach((buffer, index) => {
        const progress = Math.min(
          1,
          Math.max(0, (phase - index * stagger) / motion),
        );
        const eased = easeInOut(progress);
        const model = multiply(rotationX(-eased * TAU), rotationY(eased * TAU));
        gl.uniformMatrix4fv(uMVP, false, multiply(pv, model));
        gl.uniformMatrix3fv(uNM, false, normalMatrix(model));
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.position);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.normal);
        gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer.index);
        gl.drawElements(gl.TRIANGLES, buffer.count, gl.UNSIGNED_SHORT, 0);
      });
      gl.finish();
      canvas.dataset.renderedTime = absoluteTime.toFixed(6);
    };
    renderRef.current(timeSeconds);
    return () => {
      renderRef.current = null;
      observer.disconnect();
      buffers.forEach((buffer) => {
        gl.deleteBuffer(buffer.position);
        gl.deleteBuffer(buffer.normal);
        gl.deleteBuffer(buffer.index);
      });
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
    };
  }, [loopDuration]);

  useEffect(() => {
    renderRef.current?.(timeSeconds);
  }, [timeSeconds, baseColor, accentColor, distance, coins, appearance]);
  return (
    <div className="motion-root" style={{ background }}>
      <canvas
        ref={canvasRef}
        data-testid="gyro-loader-canvas"
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
