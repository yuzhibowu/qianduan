import { PulsingBorder } from "@paper-design/shaders-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { InteractionSample } from "../interaction";
import type { FrostedTypeBandSettings } from "./FrostedTypeBandRenderer";
import type { PaperImageSettings } from "./PaperImageRenderer";
import type { BorderIllustration } from "../border-illustration";
import { alphaEdgeMaskPixels } from "../alpha-edge-mask";
import { angleAtPerimeterPhase, perimeterAngleLut } from "../alpha-perimeter";

export type BorderRendererProps = {
  baseColor: string;
  accentColor: string;
  speed: number;
  distance: number;
  timeSeconds: number;
  loopDuration: number;
  background: string;
  borderWidth?: number;
  rounded?: number;
  glow?: number;
  neonLength?: number;
  neonPosition?: number;
  borderAspect?: number;
  borderIllustration?: BorderIllustration;
  borderOverlayIllustrations?: BorderIllustration[];
  selectedBorderOverlayIndex?: number;
  onBorderOverlayChange?: (index: number, offsetX: number, offsetY: number, scale: number) => void;
  canvasAspect?: number;
  coins?: {
    count: number;
    coinSize: number;
    spread: number;
    ringSpeed: number;
  };
  disc?: {
    count: number;
    innerRadius: number;
    thickness: number;
    burst: number;
  };
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  interactionTrack?: InteractionSample[];
  previewScale?: number;
  frostedTypeBand?: Partial<FrostedTypeBandSettings>;
  paperImage?: Partial<PaperImageSettings>;
};
type Size = { width: number; height: number };
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null),
    [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
const panelStyle = (
  distance: number,
  background: string,
  aspect = 16 / 9,
  canvasAspect = 16 / 9,
): CSSProperties => ({
  position: "absolute",
  left: "50%",
  top: "50%",
  width: `min(72%, ${(72 * aspect) / canvasAspect}%)`,
  height: "auto",
  maxHeight: `min(72%, ${(72 * canvasAspect) / aspect}%)`,
  aspectRatio: String(aspect),
  transform: `translate(-50%,-50%) scale(${20 / clamp(distance, 0.5, 80)})`,
  transformOrigin: "center",
  background: background === "transparent" ? "transparent" : background,
});
const mask: CSSProperties = {
  WebkitMaskImage: "linear-gradient(#fff 0 0), linear-gradient(#fff 0 0)",
  WebkitMaskClip: "content-box, border-box",
  WebkitMaskComposite: "xor",
  maskImage: "linear-gradient(#fff 0 0), linear-gradient(#fff 0 0)",
  maskClip: "content-box, border-box",
  maskComposite: "exclude",
};

type DecodedPng = {
  frames: Array<{ image: CanvasImageSource; duration: number }>;
  duration: number;
};
type ImageDecoderInstance = {
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount?: number } };
  decode(options: { frameIndex: number }): Promise<{ image: CanvasImageSource & { duration?: number | null } }>;
};
const decodedPngs = new Map<string, Promise<DecodedPng | null>>();

function decodePng(src: string) {
  const cached = decodedPngs.get(src);
  if (cached) return cached;
  const promise = (async () => {
    const Decoder = (window as Window & { ImageDecoder?: new (options: { data: ArrayBuffer; type: string }) => ImageDecoderInstance }).ImageDecoder;
    if (!Decoder) return null;
    const data = await fetch(src).then((response) => response.arrayBuffer());
    const decoder = new Decoder({ data, type: "image/png" });
    await decoder.tracks.ready;
    const count = Math.max(1, decoder.tracks.selectedTrack?.frameCount ?? 1);
    const frames: DecodedPng["frames"] = [];
    let duration = 0;
    for (let frameIndex = 0; frameIndex < count; frameIndex += 1) {
      const result = await decoder.decode({ frameIndex });
      const frameDuration = Math.max(1, result.image.duration ?? 100_000);
      frames.push({ image: result.image, duration: frameDuration });
      duration += frameDuration;
    }
    return { frames, duration };
  })().catch(() => null);
  decodedPngs.set(src, promise);
  return promise;
}

function Illustration({
  value,
  timeSeconds,
  overlay = false,
  overlayIndex = -1,
  onOverlayChange,
  selected = false,
  frameSize = { width: 0, height: 0 },
}: {
  value?: BorderIllustration;
  timeSeconds: number;
  overlay?: boolean;
  overlayIndex?: number;
  onOverlayChange?: (index: number, offsetX: number, offsetY: number, scale: number) => void;
  selected?: boolean;
  frameSize?: Size;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    centerX: number;
    centerY: number;
    startDistance: number;
    scale: number;
  } | null>(null);
  const [decoded, setDecoded] = useState<DecodedPng | null>(null);
  useEffect(() => {
    if (!value) return;
    let live = true;
    const ready = decodePng(value.src).then((result) => {
      if (live) setDecoded(result);
      return result;
    });
    const previous = window.__originKitAssetsReady ?? Promise.resolve();
    window.__originKitAssetsReady = Promise.all([previous, ready]).then(() => undefined);
    return () => { live = false; };
  }, [value]);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded || !value) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let cursor = ((Math.max(0, timeSeconds) * 1_000_000) % decoded.duration + decoded.duration) % decoded.duration;
    const frame = decoded.frames.find((candidate) => {
      if (cursor < candidate.duration) return true;
      cursor -= candidate.duration;
      return false;
    }) ?? decoded.frames[decoded.frames.length - 1];
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
  }, [decoded, timeSeconds, value]);
  if (!value) return null;
  const { bounds, naturalWidth, naturalHeight } = value;
  const overlayScale = value.scale ?? 100;
  const style: CSSProperties = overlay ? {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    transform: `scale(${overlayScale / 100})`,
    transformOrigin: "center",
    pointerEvents: onOverlayChange ? "auto" : "none",
    touchAction: "none",
    cursor: onOverlayChange ? "move" : undefined,
  } : {
    position: "absolute",
    zIndex: 0,
    left: `${(-bounds.x / bounds.width) * 100}%`,
    top: `${(-bounds.y / bounds.height) * 100}%`,
    width: `${(naturalWidth / bounds.width) * 100}%`,
    height: `${(naturalHeight / bounds.height) * 100}%`,
    maxWidth: "none",
    pointerEvents: "none",
  };
  const pointerHandlers = !overlay || !onOverlayChange ? {} : {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      const frame = event.currentTarget.parentElement?.getBoundingClientRect();
      if (!frame) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: value.offsetX ?? 0,
        offsetY: value.offsetY ?? 0,
        width: Math.max(1, frame.width),
        height: Math.max(1, frame.height),
      };
      onOverlayChange(overlayIndex, value.offsetX ?? 0, value.offsetY ?? 0, overlayScale);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      onOverlayChange(
        overlayIndex,
        drag.offsetX + ((event.clientX - drag.startX) / drag.width) * 100,
        drag.offsetY + ((event.clientY - drag.startY) / drag.height) * 100,
        overlayScale,
      );
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => { dragRef.current = null; },
  };
  const media = decoded ? (
    <canvas ref={canvasRef} width={naturalWidth} height={naturalHeight} style={style} {...pointerHandlers} />
  ) : (
    <img src={value.src} alt="" draggable={false} style={style} {...pointerHandlers} />
  );
  if (!overlay) return media;

  const frameAspect = frameSize.width / Math.max(1, frameSize.height);
  const sourceAspect = naturalWidth / Math.max(1, naturalHeight);
  const fittedWidth = sourceAspect >= frameAspect ? 100 : (sourceAspect / frameAspect) * 100;
  const fittedHeight = sourceAspect >= frameAspect ? (frameAspect / sourceAspect) * 100 : 100;
  const fittedLeft = (100 - fittedWidth) / 2;
  const fittedTop = (100 - fittedHeight) / 2;
  const visibleRight = fittedLeft + fittedWidth * ((bounds.x + bounds.width) / naturalWidth);
  const visibleBottom = fittedTop + fittedHeight * ((bounds.y + bounds.height) / naturalHeight);
  const scaledRight = 50 + (visibleRight - 50) * (overlayScale / 100);
  const scaledBottom = 50 + (visibleBottom - 50) * (overlayScale / 100);
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 2 + overlayIndex,
        inset: 0,
        transform: `translate(${value.offsetX ?? 0}%, ${value.offsetY ?? 0}%)`,
        pointerEvents: "none",
      }}
    >
      {media}
      {selected && onOverlayChange && (
        <div
          aria-label="PNG 插图缩放锚点"
          style={{
            position: "absolute",
            zIndex: 20,
            left: `${scaledRight}%`,
            top: `${scaledBottom}%`,
            width: 12,
            height: 12,
            boxSizing: "border-box",
            border: "1.5px solid #1d1d1f",
            background: "#fff",
            transform: "translate(-50%, -50%)",
            pointerEvents: "auto",
            touchAction: "none",
            cursor: "nwse-resize",
          }}
          onPointerDown={(event) => {
            const frame = event.currentTarget.parentElement?.getBoundingClientRect();
            if (!frame) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            const centerX = frame.left + frame.width / 2;
            const centerY = frame.top + frame.height / 2;
            resizeRef.current = {
              pointerId: event.pointerId,
              centerX,
              centerY,
              startDistance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
              scale: overlayScale,
            };
          }}
          onPointerMove={(event) => {
            const resize = resizeRef.current;
            if (!resize || resize.pointerId !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const distance = Math.hypot(event.clientX - resize.centerX, event.clientY - resize.centerY);
            onOverlayChange(
              overlayIndex,
              value.offsetX ?? 0,
              value.offsetY ?? 0,
              clamp(resize.scale * (distance / resize.startDistance), 10, 400),
            );
          }}
          onPointerUp={(event) => {
            if (resizeRef.current?.pointerId !== event.pointerId) return;
            resizeRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { resizeRef.current = null; }}
        />
      )}
    </div>
  );
}

function OverlayIllustrations({
  values,
  timeSeconds,
  onChange,
  selectedIndex,
  frameSize,
}: {
  values?: BorderIllustration[];
  timeSeconds: number;
  onChange?: (index: number, offsetX: number, offsetY: number, scale: number) => void;
  selectedIndex?: number;
  frameSize: Size;
}) {
  return values?.map((value, index) => (
    <Illustration
      key={`${value.src.slice(-48)}-${index}`}
      value={value}
      timeSeconds={timeSeconds}
      overlay
      overlayIndex={index}
      onOverlayChange={onChange}
      selected={selectedIndex === index}
      frameSize={frameSize}
    />
  )) ?? null;
}

function useIllustrationEdgeMasks(
  value: BorderIllustration | undefined,
  size: Size,
  widths: number[],
) {
  const [geometry, setGeometry] = useState<{ urls: string[]; angles: number[] } | null>(null);
  const widthsKey = widths.map((width) => width.toFixed(3)).join(",");
  useEffect(() => {
    if (!value || size.width < 1 || size.height < 1) {
      setGeometry(null);
      return;
    }
    let live = true;
    let objectUrls: string[] = [];
    const ready = (async () => {
      const source = new Image();
      source.src = value.src;
      await source.decode();
      const { bounds } = value;
      const analysisScale = Math.min(1, 2048 / Math.max(bounds.width, bounds.height));
      const analysisWidth = Math.max(1, Math.round(bounds.width * analysisScale));
      const analysisHeight = Math.max(1, Math.round(bounds.height * analysisScale));
      const analysisCanvas = document.createElement("canvas");
      analysisCanvas.width = analysisWidth;
      analysisCanvas.height = analysisHeight;
      const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });
      if (!analysisContext) throw new Error("无法分析 PNG 的实际周长");
      analysisContext.imageSmoothingEnabled = true;
      analysisContext.imageSmoothingQuality = "high";
      analysisContext.drawImage(
        source,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        analysisWidth,
        analysisHeight,
      );
      const pixels = analysisContext.getImageData(0, 0, analysisWidth, analysisHeight).data;
      const angles = perimeterAngleLut(pixels, analysisWidth, analysisHeight);
      if (!angles.length) throw new Error("PNG 中没有可用的主体闭合轮廓");
      const width = Math.max(1, size.width);
      const pathUnitsPerPixel = analysisWidth / width;
      const next = await Promise.all(widths.map(async (edgeWidth) => {
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = analysisWidth;
        maskCanvas.height = analysisHeight;
        const maskContext = maskCanvas.getContext("2d");
        if (!maskContext) throw new Error("无法生成 PNG 的等距发光边缘");
        maskContext.putImageData(new ImageData(
          alphaEdgeMaskPixels(
            pixels,
            analysisWidth,
            analysisHeight,
            edgeWidth * pathUnitsPerPixel,
          ),
          analysisWidth,
          analysisHeight,
        ), 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => {
          maskCanvas.toBlob((result) => result ? resolve(result) : reject(new Error("无法编码发光边缘遮罩")), "image/png");
        });
        return URL.createObjectURL(blob);
      }));
      objectUrls = next;
      if (live) setGeometry({ urls: next, angles });
    })().catch((error) => {
      console.error(error);
      if (live) setGeometry(null);
    });
    const previous = window.__originKitAssetsReady ?? Promise.resolve();
    window.__originKitAssetsReady = Promise.all([previous, ready]).then(() => undefined);
    return () => {
      live = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [value, size.height, size.width, widthsKey]);
  return geometry;
}

export function GlowBorder({
  baseColor,
  accentColor,
  speed,
  distance,
  timeSeconds,
  background,
  borderWidth = 5,
  rounded = 0,
  borderAspect = 16 / 9,
  canvasAspect = 16 / 9,
  borderIllustration,
  borderOverlayIllustrations,
  onBorderOverlayChange,
  selectedBorderOverlayIndex,
}: BorderRendererProps) {
  const [frameRef, size] = useSize<HTMLDivElement>(),
    rotorSize = Math.ceil(Math.hypot(size.width, size.height)) + 24,
    radius =
      ((clamp(rounded, 0, 100) / 100) * Math.min(size.width, size.height)) / 2,
    angle = (timeSeconds * clamp(speed, 0, 100) * 3.6) % 360;
  const tailColor = `${baseColor}66`,
    resting = "rgba(255,255,255,0.04)",
    arc = 0.6 * 180 * 0.94,
    softLead = Math.max(6, arc * 0.35),
    softTail = Math.max(8, arc * 0.3);
  const tail = (start: number) =>
    [
      `${accentColor} ${start}deg`,
      `${tailColor} ${start + softTail}deg`,
      `${resting} ${start + softTail * 2}deg`,
      `${resting} ${start + 180 - arc}deg`,
      `${tailColor} ${start + 180 - softLead}deg`,
    ].join(", ");
  const gradient = `conic-gradient(from 0deg at 50% 50%, ${tail(0)}, ${tail(180)}, ${accentColor} 360deg)`;
  return (
    <div className="motion-root">
      <div
        ref={frameRef}
        style={panelStyle(distance, background, borderAspect, canvasAspect)}
      >
        <Illustration value={borderIllustration} timeSeconds={timeSeconds} />
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            minWidth: 8,
            minHeight: 8,
            boxSizing: "border-box",
            borderRadius: radius,
            padding: Math.max(0, borderWidth),
            overflow: "hidden",
            pointerEvents: "none",
            ...mask,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: rotorSize,
              height: rotorSize,
              top: `calc(50% - ${rotorSize / 2}px)`,
              left: `calc(50% - ${rotorSize / 2}px)`,
              background: gradient,
              transform: `rotate(${angle}deg)`,
              transformOrigin: "center",
            }}
          />
        </div>
        <OverlayIllustrations values={borderOverlayIllustrations} timeSeconds={timeSeconds} onChange={onBorderOverlayChange} selectedIndex={selectedBorderOverlayIndex} frameSize={size} />
      </div>
    </div>
  );
}

function rgba(color: string, alpha: number) {
  const found = color.trim().match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (!found) return `rgba(0,0,0,${alpha})`;
  const hex =
      found.length <= 4
        ? found
            .split("")
            .map((x) => x + x)
            .join("")
        : found,
    value = parseInt(hex.slice(0, 6), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}
function perimeterPoint(phase: number, w: number, h: number) {
  const p = (((phase % 1) + 1) % 1) * 2 * (w + h);
  return p < w
    ? [p, 0]
    : p < w + h
      ? [w, p - w]
      : p < w * 2 + h
        ? [w - (p - w - h), h]
        : [0, h - (p - w * 2 - h)];
}
function cornerPhase(i: number, w: number, h: number) {
  const p = 2 * (w + h),
    corners = [0, w / p, (w + h) / p, (w * 2 + h) / p];
  return Math.floor(i / 4) + corners[((i % 4) + 4) % 4];
}
function angleAt(phase: number, w: number, h: number) {
  const [x, y] = perimeterPoint(phase, w, h);
  return (Math.atan2(x - w / 2, h / 2 - y) * 180) / Math.PI;
}
function neonArc(
  phase: number,
  borderSize: number,
  width: number,
  height: number,
  color: string,
  perimeterAngles?: number[],
) {
  const w = width || 100,
    h = height || 100,
    length = clamp(borderSize, 0, 100),
    span = Math.max(0.015, (length / 100) * 0.5),
    reach = length / 100,
    stops: string[] = [];
  let first = 0,
    previous = 0,
    total = 0;
  for (let i = 0; i <= 96; i++) {
    const progress = i / 96,
      samplePhase = phase + (progress - 0.5) * span,
      angle = perimeterAngles?.length
        ? angleAtPerimeterPhase(perimeterAngles, samplePhase)
        : angleAt(samplePhase, w, h);
    if (i === 0) first = angle;
    else {
      let delta = angle - previous;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      total += delta;
    }
    previous = angle;
    const edge = Math.abs(progress - 0.5) * 2,
      fade = reach >= 1 || edge <= reach ? 1 : 1 - (edge - reach) / (1 - reach),
      smooth = fade * fade * (3 - 2 * fade);
    stops.push(`${rgba(color, smooth)} ${total.toFixed(2)}deg`);
  }
  stops.push(
    `${rgba(color, 0)} ${total.toFixed(2)}deg`,
    `${rgba(color, 0)} 360deg`,
  );
  return `conic-gradient(from ${first.toFixed(2)}deg at 50% 50%, ${stops.join(", ")})`;
}
function bezier(value: number) {
  const [x1, y1, x2, y2] = [0.65, 0, 0.35, 1],
    curve = (a: number, b: number, t: number) =>
      3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let t = clamp(value, 0, 1);
  for (let i = 0; i < 8; i++) {
    const error = curve(x1, x2, t) - value,
      derivative =
        3 * (1 - t) ** 2 * x1 +
        6 * (1 - t) * t * (x2 - x1) +
        3 * t ** 2 * (1 - x2);
    if (Math.abs(derivative) < 1e-6) break;
    t = clamp(t - error / derivative, 0, 1);
  }
  return curve(y1, y2, t);
}

export function NeonBorder({
  baseColor,
  speed,
  distance,
  timeSeconds,
  background,
  borderWidth = 6,
  rounded = 24,
  glow = 100,
  neonLength = 50,
  neonPosition = 0,
  borderAspect = 16 / 9,
  canvasAspect = 16 / 9,
  borderIllustration,
  borderOverlayIllustrations,
  onBorderOverlayChange,
  selectedBorderOverlayIndex,
}: BorderRendererProps) {
  const [frameRef, size] = useSize<HTMLDivElement>(),
    safeSpeed = clamp(speed, 0, 20),
    segment = (30 + ((4 - 30) * (safeSpeed - 1)) / 19) / 4,
    total = safeSpeed > 0 ? timeSeconds / segment : 0,
    step = Math.floor(total),
    progress = bezier(total - step),
    start = cornerPhase(step, size.width || 100, size.height || 100),
    end = cornerPhase(step + 1, size.width || 100, size.height || 100),
    phase = start + (end - start) * progress,
    radius =
      ((clamp(rounded, 0, 100) / 100) * Math.min(size.width, size.height)) / 2,
    glowAmount = clamp(glow, 0, 100) / 100;
  const layers = [
      { blur: 8, opacity: 0.5, reach: 0.3 },
      { blur: 15, opacity: 0.3, reach: 0.6 },
      { blur: 57, opacity: 0.18, reach: 1 },
    ];
  const contourWidths = [
      borderWidth,
      ...layers.map((layer) => borderWidth + glowAmount * 36 * layer.reach),
    ],
    contourGeometry = useIllustrationEdgeMasks(borderIllustration, size, contourWidths),
    contourMasks = contourGeometry?.urls,
    makeArc = (offset: number) =>
      neonArc(
        phase + offset + clamp(neonPosition, -100, 100) / 100,
        clamp(neonLength, 1, 100),
        size.width,
        size.height,
        baseColor,
        contourGeometry?.angles,
      );
  const maskedEdge = (maskUrl: string) => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "var(--arc)",
        WebkitMaskImage: `url("${maskUrl}")`,
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "100% 100%",
        maskImage: `url("${maskUrl}")`,
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "100% 100%",
      }}
    />
  );
  const edge = (padding: number, inset = 0) => (
    <div
      style={{
        position: "absolute",
        // The luminous stroke belongs to the frame's inner edge. Blurred glow may
        // spread outside naturally, but the moving stroke itself must not enlarge
        // the frame or orbit outside an imported illustration.
        inset,
        boxSizing: "border-box",
        padding,
        borderRadius: radius,
        background: "var(--arc)",
        ...mask,
      }}
    />
  );
  const ring = (offset: number) => (
    <div
      style={
        {
          position: "absolute",
          inset: 0,
          overflow: "visible",
          pointerEvents: "none",
          "--arc": makeArc(offset),
        } as CSSProperties
      }
    >
      {glowAmount > 0 &&
        layers.map((layer, i) => {
          const reach = borderWidth + glowAmount * 36 * layer.reach;
          if (contourMasks) {
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: layer.opacity,
                  mixBlendMode: "plus-lighter",
                  filter: `blur(${layer.blur}px)`,
                  WebkitFilter: `blur(${layer.blur}px)`,
                }}
              >
                {maskedEdge(contourMasks[i + 1])}
              </div>
            );
          }
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                inset: -160,
                boxSizing: "border-box",
                padding: 160,
                borderRadius: radius + 160,
                opacity: layer.opacity,
                mixBlendMode: "plus-lighter",
                filter: `blur(${layer.blur}px)`,
                WebkitFilter: `blur(${layer.blur}px)`,
                ...mask,
              }}
            >
              {edge(reach, 160)}
            </div>
          );
        })}
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            mixBlendMode: "plus-lighter",
          }}
        >
          {contourMasks ? maskedEdge(contourMasks[0]) : edge(borderWidth)}
        </div>
      ))}
    </div>
  );
  return (
    <div className="motion-root">
      <div
        ref={frameRef}
        style={{
          ...panelStyle(distance, background, borderAspect, canvasAspect),
          borderRadius: radius,
          overflow: "visible",
        }}
      >
        <Illustration value={borderIllustration} timeSeconds={timeSeconds} />
        {ring(0)}
        {ring(0.5)}
        <OverlayIllustrations values={borderOverlayIllustrations} timeSeconds={timeSeconds} onChange={onBorderOverlayChange} selectedIndex={selectedBorderOverlayIndex} frameSize={size} />
      </div>
    </div>
  );
}

export function PulsatingBorder({
  baseColor,
  accentColor,
  speed,
  distance,
  timeSeconds,
  background,
  borderWidth = 5,
  rounded = 35,
  glow = 50,
  borderAspect = 16 / 9,
  canvasAspect = 16 / 9,
  borderIllustration,
  borderOverlayIllustrations,
  onBorderOverlayChange,
  selectedBorderOverlayIndex,
}: BorderRendererProps) {
  const [frameRef, size] = useSize<HTMLDivElement>(),
    spread = 31,
    worldWidth = size.width + spread * 2,
    worldHeight = size.height + spread * 2,
    extra = Math.min(480, Math.ceil(0.4 * Math.min(worldWidth, worldHeight))),
    outset = spread + extra;
  return (
    <div className="motion-root">
      <div
        ref={frameRef}
        style={panelStyle(distance, background, borderAspect, canvasAspect)}
      >
        <Illustration value={borderIllustration} timeSeconds={timeSeconds} />
        {size.width > 0 && size.height > 0 && (
          <PulsingBorder
            colors={[baseColor, accentColor, "#379590"]}
            colorBack="rgba(0,0,0,0)"
            speed={0}
            frame={timeSeconds * clamp(speed, 1, 10) * 1000}
            roundness={rounded / 100}
            thickness={borderWidth / 100}
            softness={0.75}
            intensity={0.3}
            bloom={glow / 100}
            spots={3}
            spotSize={0.3}
            pulse={0}
            smoke={0.35}
            smokeSize={0.63}
            worldWidth={worldWidth}
            worldHeight={worldHeight}
            fit="none"
            scale={1}
            marginLeft={spread / worldWidth}
            marginRight={spread / worldWidth}
            marginTop={spread / worldHeight}
            marginBottom={spread / worldHeight}
            style={{
              position: "absolute",
              left: -outset,
              top: -outset,
              width: size.width + outset * 2,
              height: size.height + outset * 2,
              pointerEvents: "none",
            }}
          />
        )}
        <OverlayIllustrations values={borderOverlayIllustrations} timeSeconds={timeSeconds} onChange={onBorderOverlayChange} selectedIndex={selectedBorderOverlayIndex} frameSize={size} />
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __originKitAssetsReady?: Promise<void>;
  }
}
