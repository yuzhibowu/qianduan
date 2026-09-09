import { PulsingBorder } from "@paper-design/shaders-react";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

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
  coins?: {
    count: number;
    coinSize: number;
    spread: number;
    ringSpeed: number;
  };
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
const panelStyle = (distance: number, background: string): CSSProperties => ({
  position: "absolute",
  left: "50%",
  top: "50%",
  width: "72%",
  height: "58%",
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

export function GlowBorder({
  baseColor,
  accentColor,
  speed,
  distance,
  timeSeconds,
  background,
  borderWidth = 5,
  rounded = 0,
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
      <div ref={frameRef} style={panelStyle(distance, background)}>
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
  for (let i = 0; i <= 24; i++) {
    const progress = i / 24,
      angle = angleAt(phase + (progress - 0.5) * span, w, h);
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
    ],
    makeArc = (offset: number) =>
      neonArc(phase + offset, 50, size.width, size.height, baseColor);
  const edge = (padding: number, inset = 0) => (
    <div
      style={{
        position: "absolute",
        inset: inset - padding,
        boxSizing: "border-box",
        padding,
        borderRadius: radius + padding,
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
          {edge(borderWidth)}
        </div>
      ))}
    </div>
  );
  return (
    <div className="motion-root">
      <div
        ref={frameRef}
        style={{
          ...panelStyle(distance, background),
          borderRadius: radius,
          overflow: "visible",
        }}
      >
        {ring(0)}
        {ring(0.5)}
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
}: BorderRendererProps) {
  const [frameRef, size] = useSize<HTMLDivElement>(),
    spread = 31,
    worldWidth = size.width + spread * 2,
    worldHeight = size.height + spread * 2,
    extra = Math.min(480, Math.ceil(0.4 * Math.min(worldWidth, worldHeight))),
    outset = spread + extra;
  return (
    <div className="motion-root">
      <div ref={frameRef} style={panelStyle(distance, background)}>
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
      </div>
    </div>
  );
}
