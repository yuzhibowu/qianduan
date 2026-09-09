import { PulsingBorder } from "@paper-design/shaders-react";

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
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const panelStyle = (
  distance: number,
  background: string,
): React.CSSProperties => ({
  position: "absolute",
  left: "50%",
  top: "50%",
  width: "56%",
  height: "48%",
  transform: `translate(-50%,-50%) scale(${20 / clamp(distance, 0.5, 80)})`,
  background: background === "transparent" ? "transparent" : background,
});

export function GlowBorder({
  baseColor,
  accentColor,
  speed,
  distance,
  timeSeconds,
  background,
  borderWidth = 5,
  rounded = 18,
}: BorderRendererProps) {
  const angle = (timeSeconds * clamp(speed, 0, 100) * 3.6) % 360;
  const resting = `${baseColor}12`;
  const gradient = `conic-gradient(from 0deg, ${accentColor} 0deg, ${baseColor}99 22deg, ${resting} 52deg, ${resting} 128deg, ${baseColor}99 158deg, ${accentColor} 180deg, ${baseColor}99 202deg, ${resting} 232deg, ${resting} 308deg, ${baseColor}99 338deg, ${accentColor} 360deg)`;
  return (
    <div className="motion-root">
      <div style={panelStyle(distance, background)}>
        <div
          className="masked-border"
          style={{ padding: borderWidth, borderRadius: `${rounded}%` }}
        >
          <div
            className="border-rotor"
            style={{ background: gradient, transform: `rotate(${angle}deg)` }}
          />
        </div>
      </div>
    </div>
  );
}

function rgba(hex: string, alpha: number) {
  const value = hex.replace("#", "").slice(0, 6).padEnd(6, "0");
  const number = Number.parseInt(value, 16);
  return `rgba(${number >> 16},${(number >> 8) & 255},${number & 255},${alpha})`;
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
  const phase =
    (((timeSeconds / Math.max(0.1, 7.5 - clamp(speed, 1, 20) * 0.29)) % 1) +
      1) %
    1;
  const angle = phase * 360;
  const arc = `conic-gradient(from ${angle}deg, transparent 0deg, ${rgba(baseColor, 0)} 255deg, ${rgba(baseColor, 0.95)} 330deg, ${baseColor} 350deg, ${rgba(baseColor, 0)} 360deg)`;
  const radius = `${rounded}%`;
  return (
    <div className="motion-root">
      <div style={panelStyle(distance, background)}>
        <div className="neon-wrap" style={{ borderRadius: radius }}>
          <div
            className="neon-glow"
            style={{
              padding: borderWidth + glow * 0.22,
              borderRadius: radius,
              background: arc,
              filter: `blur(${8 + glow * 0.16}px)`,
              opacity: 0.62,
            }}
          />
          <div
            className="masked-border"
            style={{ padding: borderWidth, borderRadius: radius }}
          >
            <div className="border-fill" style={{ background: arc }} />
          </div>
        </div>
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
  const width = 760;
  const height = 430;
  const spread = 31;
  return (
    <div className="motion-root">
      <div style={panelStyle(distance, background)}>
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
          worldWidth={width + spread * 2}
          worldHeight={height + spread * 2}
          fit="none"
          style={{
            position: "absolute",
            inset: -spread,
            width: `calc(100% + ${spread * 2}px)`,
            height: `calc(100% + ${spread * 2}px)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}
