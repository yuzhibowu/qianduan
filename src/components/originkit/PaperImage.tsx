"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { interactionAt, type InteractionSample } from "../../interaction";

const DEFAULTS = {
  cardWidth: 340,
  cardHeight: 440,
  mode: "Wave" as "Wave" | "Lift",
  hoverLift: 100,
  restLift: 60,
  depth: 40,
  sheen: 35,
};

interface PaperImageImage {
  src: string;
  alt?: string;
}

export interface PaperImageProps {
  image?: PaperImageImage | string;
  style?: CSSProperties;
  cardWidth?: number;
  cardHeight?: number;
  mode?: "Wave" | "Lift";
  hoverLift?: number;
  restLift?: number;
  depth?: number;
  sheen?: number;
  /** OriginKit -> Keynote adapter: deterministic absolute timeline. */
  timeSeconds?: number;
  /** OriginKit -> Keynote adapter: recorded pointer playback. */
  interactionTrack?: InteractionSample[];
}

function clamp(n: any, min: number, max: number, fallback: number) {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function imageURL(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.src || value.url || value.value || "";
}

function settings(p: any) {
  return {
    cardWidth: clamp(p?.cardWidth, 40, 800, DEFAULTS.cardWidth),
    cardHeight: clamp(p?.cardHeight, 40, 800, DEFAULTS.cardHeight),

    flutter: (clamp(p?.hoverLift, 0, 100, DEFAULTS.hoverLift) / 100) * 0.75,
    idle: (clamp(p?.restLift, 0, 100, DEFAULTS.restLift) / 100) * 0.75,

    depth: (clamp(p?.depth, 0, 100, DEFAULTS.depth) / 100) * 0.5,
    sheen: clamp(p?.sheen, 0, 100, DEFAULTS.sheen) / 100,
    lift: (p?.mode ?? DEFAULTS.mode) === "Lift",
  };
}

export default function PaperImage(props: PaperImageProps) {
  const {
    image,
    style,
    cardWidth = DEFAULTS.cardWidth,
    cardHeight = DEFAULTS.cardHeight,
    mode = DEFAULTS.mode,
    hoverLift = DEFAULTS.hoverLift,
    restLift = DEFAULTS.restLift,
    depth = DEFAULTS.depth,
    sheen = DEFAULTS.sheen,
    timeSeconds,
    interactionTrack = [],
  } = props;
  const S = settings({ cardWidth, cardHeight, mode, hoverLift, restLift, depth, sheen });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const liveRef = useRef({ ...S, timeSeconds, interactionTrack });
  liveRef.current = { ...S, timeSeconds, interactionTrack };

  const hoveringRef = useRef(false);
  const mouseXRef = useRef(0.5);

  const imgUrl = imageURL(image);

  useEffect(() => {
    if (!imgUrl) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch {
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const exportStage = container.closest("[data-testid='export-stage']") as HTMLElement | null;
    const capture = async () => {
      const output = document.createElement("canvas");
      const stageRect = exportStage!.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      output.width = Math.round(stageRect.width);
      output.height = Math.round(stageRect.height);
      output.getContext("2d", { alpha: true })!.drawImage(
        canvas,
        canvasRect.left - stageRect.left,
        canvasRect.top - stageRect.top,
        canvasRect.width,
        canvasRect.height,
      );
      return output;
    };
    if (exportStage) window.__originKitCaptureFrame = capture;

    const FOV = 30;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);

    const uniforms = {
      uTime: { value: 0 },
      uWind: { value: reduced ? 0 : liveRef.current.idle },
      uMouseX: { value: 0.5 },
      uPlaneSize: { value: new THREE.Vector2(0.75, 1) },
      uImageAspect: { value: 0.75 },
      uAmp: { value: liveRef.current.depth },
      uMode: { value: liveRef.current.lift ? 1 : 0 },
      uSheen: { value: liveRef.current.sheen },
      uTex: { value: null as THREE.Texture | null },
      uHasTex: { value: 0 },
    };

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 96, 96),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(mesh);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let resolveReady: () => void;
    let rejectReady: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    if (container.closest("[data-testid='export-stage']")) {
      const previous = window.__originKitAssetsReady ?? Promise.resolve();
      window.__originKitAssetsReady = Promise.all([previous, ready]).then(() => undefined);
    }
    loader.load(
      imgUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        uniforms.uTex.value = tex;
        uniforms.uHasTex.value = 1;
        const img: any = tex.image;
        if (img?.width) uniforms.uImageAspect.value = img.width / img.height;
        resolveReady();
      },
      undefined,

      () => {
        rejectReady(new Error("Paper Image 图片加载失败，请检查图片地址或重新导入"));
        console.warn("PaperImage: image failed to load:", imgUrl);
      },
    );

    const halfTan = Math.tan((FOV * Math.PI) / 180 / 2);
    const OVERSCAN = 1.8;

    function onMove(e: PointerEvent) {
      const r = container!.getBoundingClientRect();
      mouseXRef.current = Math.min(
        1,
        Math.max(0, (e.clientX - r.left) / (r.width || 1)),
      );
      hoveringRef.current = true;
    }
    function onLeave() {
      hoveringRef.current = false;
    }
    if (!reduced) {
      container.addEventListener("pointermove", onMove);
      container.addEventListener("pointerleave", onLeave);
    }

    let w = 0;
    let h = 0;
    const start = performance.now();
    let raf = 0;
    function loop() {
      raf = requestAnimationFrame(loop);
      const L = liveRef.current;
      const cw = container!.clientWidth;
      const ch = container!.clientHeight;
      if (cw > 0 && ch > 0 && (cw !== w || ch !== h)) {
        w = cw;
        h = ch;
        renderer.setSize(w * OVERSCAN, h * OVERSCAN, false);
        camera.aspect = w / h;
        uniforms.uPlaneSize.value.set(w / h, 1);
        camera.updateProjectionMatrix();
      }
      if (w === 0) return;

      const controlledTime = typeof L.timeSeconds === "number" ? L.timeSeconds : null;
      uniforms.uTime.value = controlledTime ?? (performance.now() - start) / 1000;
      uniforms.uAmp.value = L.depth;
      uniforms.uSheen.value = L.sheen;
      uniforms.uMode.value = L.lift ? 1 : 0;

      const recorded = controlledTime === null ? null : interactionAt(L.interactionTrack, controlledTime);
      const active = recorded?.active ?? hoveringRef.current;
      if (recorded) mouseXRef.current = recorded.x;
      const wind = reduced ? 0 : active ? L.flutter : L.idle;
      uniforms.uWind.value += (wind - uniforms.uWind.value) * 0.06;
      uniforms.uMouseX.value +=
        (mouseXRef.current - uniforms.uMouseX.value) * 0.1;

      camera.position.z = OVERSCAN / (2 * halfTan);
      renderer.render(scene, camera);
    }

    let running = false;
    const io = exportStage ? null : new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (running) return;
          running = true;
          loop();
        } else {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.01 },
    );
    if (io) io.observe(container);
    else loop();

    return () => {
      io?.disconnect();
      if (window.__originKitCaptureFrame === capture) delete window.__originKitCaptureFrame;
      cancelAnimationFrame(raf);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      uniforms.uTex.value?.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [imgUrl]);

  return (
    <div
      style={{
        ...(style as CSSProperties),
        position: "relative",

        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        overflow: "visible",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: S.cardWidth,
          height: S.cardHeight,
          flex: "0 0 auto",
          overflow: "visible",
        }}
      >
        {!imgUrl && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "#E7E7EA",
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          data-paper-image-canvas
          style={{
            position: "absolute",
            top: "-40%",
            left: "-40%",
            width: "180%",
            height: "180%",
            display: "block",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

const VERT =  `
uniform float uTime, uWind, uMouseX, uAmp, uMode;
uniform vec2 uPlaneSize;
varying vec2 vUv; varying vec3 vNormal, vViewPos;

float wave(vec2 uv, float t, float wind) {
    float mask = pow(max(0.0, 1.0 - uv.y), 1.1);
    float w = sin(uv.x * 6.0 + t * 3.0) * 0.5
            + sin(uv.x * 11.0 - t * 2.0 + uv.y * 4.0) * 0.25
            + sin((uv.x + uv.y) * 8.0 + t * 4.0) * 0.15;

    w += sin(uv.x * 9.0 + t * 5.0) * 0.3 * smoothstep(0.35, 0.0, abs(uv.x - uMouseX));
    return w * mask * wind;
}
float disp(vec2 uv, float t, float wind) {
    float ripple = wave(uv, t, wind);
    if (uMode < 0.5) return uAmp * ripple;
    return uAmp * (ripple * 0.6 + pow(max(0.0, 1.0 - uv.y), 2.0) * wind * 3.0);
}
void main() {
    vUv = uv;

    float z = disp(uv, uTime, uWind), e = 0.002;
    float dzdx = (disp(uv + vec2(e,0), uTime, uWind) - disp(uv - vec2(e,0), uTime, uWind)) / (2.0*e) / uPlaneSize.x;
    float dzdy = (disp(uv + vec2(0,e), uTime, uWind) - disp(uv - vec2(0,e), uTime, uWind)) / (2.0*e) / uPlaneSize.y;
    vNormal = normalMatrix * normalize(vec3(-dzdx, -dzdy, 1.0));
    float yLift = uMode < 0.5 ? 0.0 : uAmp * pow(max(0.0, 1.0 - uv.y), 2.0) * uWind * 1.2;
    vec4 mv = modelViewMatrix * vec4(position.x * uPlaneSize.x, position.y + yLift, z, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
}
`;

const FRAG =  `
precision highp float;
uniform sampler2D uTex; uniform float uHasTex, uSheen, uImageAspect; uniform vec2 uPlaneSize;
varying vec2 vUv; varying vec3 vNormal, vViewPos;
void main() {
    float ar = uPlaneSize.x; vec2 st = vUv;
    if (ar > uImageAspect) st.x = (vUv.x - 0.5) * (ar / uImageAspect) + 0.5;
    else st.y = (vUv.y - 0.5) * (uImageAspect / ar) + 0.5;
    if (any(lessThan(st, vec2(0.0))) || any(greaterThan(st, vec2(1.0)))) discard;
    vec4 sampled = uHasTex > 0.5 ? texture2D(uTex, st) : vec4(vec3(0.85), 1.0);
    if (sampled.a <= 0.0) discard;
    vec3 base = sampled.rgb;
    vec3 N = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
    vec3 L = normalize(vec3(0.35, 0.55, 0.75)), V = normalize(-vViewPos);
    float diff = clamp(dot(N, L), 0.0, 1.0);
    float spec = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 26.0);

    float shade = (0.68 + diff * 0.45) / (0.68 + L.z * 0.45);
    float flatSpec = pow(clamp(normalize(L + V).z, 0.0, 1.0), 26.0);
    gl_FragColor = vec4(base * shade + max(spec - flatSpec, 0.0) * uSheen, sampled.a);
    #include <colorspace_fragment>
}
`;

PaperImage.displayName = "Paper Image";

declare global {
  interface Window {
    __originKitPaperImages?: Record<string, string>;
  }
}
