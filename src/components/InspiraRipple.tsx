import { useEffect, useRef, useState, type CSSProperties } from "react";

export type RippleShape = "round" | "square" | "blob" | "lines";

export type InspiraRippleSettings = {
  baseCircleSize: number;
  baseCircleOpacity: number;
  spaceBetweenCircle: number;
  circleOpacityDowngradeRatio: number;
  waveSpeed: number;
  numberOfCircles: number;
  circleClass: string;
  shape: RippleShape;
  circleColor: string;
};

export const DEFAULT_INSPIRA_RIPPLE: InspiraRippleSettings = {
  baseCircleSize: 210,
  baseCircleOpacity: 0.24,
  spaceBetweenCircle: 70,
  circleOpacityDowngradeRatio: 0.03,
  waveSpeed: 80,
  numberOfCircles: 7,
  circleClass: "",
  shape: "round",
  circleColor: "currentColor",
};

type Props = {
  ripple?: Partial<InspiraRippleSettings>;
  timeSeconds?: number;
  loopDuration?: number;
  background?: string;
};

export const INSPIRA_RIPPLE_API = {
  baseCircleSize: { type: "number", default: 210, unit: "px", officialRange: [80, 360], step: 1 },
  baseCircleOpacity: { type: "number", default: 0.24, unit: null, officialRange: [0.05, 0.8], step: 0.01 },
  circleOpacityDowngradeRatio: { type: "number", default: 0.03, unit: null, officialRange: [0.01, 0.12], step: 0.01 },
  waveSpeed: { type: "number", default: 80, unit: "ms", officialRange: [10, 240], step: 5 },
  spaceBetweenCircle: { type: "number", default: 70, unit: "px", officialRange: [20, 140], step: 5 },
  numberOfCircles: { type: "number", default: 7, unit: null, officialRange: [2, 14], step: 1 },
  circleClass: { type: "string", default: undefined, unit: null, officialRange: null, controlRange: null },
} as const;

function cubicCoordinate(t: number, first: number, second: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
}

function cubicDerivative(t: number, first: number, second: number) {
  const inverse = 1 - t;
  return 3 * inverse * inverse * first + 6 * inverse * t * (second - first) + 3 * t * t * (1 - second);
}

export function cssEaseInOut(progress: number) {
  const x = Math.min(1, Math.max(0, progress));
  let parameter = x;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = cubicCoordinate(parameter, 0.42, 0.58) - x;
    const derivative = cubicDerivative(parameter, 0.42, 0.58);
    if (Math.abs(derivative) < 1e-7) break;
    parameter = Math.min(1, Math.max(0, parameter - error / derivative));
  }
  return cubicCoordinate(parameter, 0, 1);
}

export function rippleScaleAtTime(timeSeconds: number, waveSpeed: number, index: number) {
  const periodSeconds = 2;
  const delayedTime = timeSeconds - (index * waveSpeed) / 1000;
  const phase = ((delayedTime % periodSeconds) + periodSeconds) % periodSeconds;
  const segmentProgress = phase <= 1 ? phase : phase - 1;
  const eased = cssEaseInOut(segmentProgress);
  return phase <= 1 ? 1 - eased * 0.1 : 0.9 + eased * 0.1;
}

export function rippleCircleStyle(
  settings: InspiraRippleSettings,
  index: number,
  timeSeconds: number,
  outputBackground = "transparent",
  sizeScale = 1,
): CSSProperties {
  const size = (settings.baseCircleSize + index * settings.spaceBetweenCircle) * sizeScale;
  const automaticColor = outputBackground.toUpperCase() === "#FFFFFF" ? "#000000" : "#FFFFFF";
  const circleColor = settings.circleColor === "currentColor" ? automaticColor : settings.circleColor;
  return {
    width: size,
    height: size,
    opacity: settings.baseCircleOpacity - index * settings.circleOpacityDowngradeRatio,
    animationDelay: `${index * settings.waveSpeed - timeSeconds * 1000}ms`,
    borderColor: circleColor,
    borderStyle: index === settings.numberOfCircles - 1 ? "dashed" : "solid",
    borderRadius:
      settings.shape === "round" || settings.shape === "lines"
        ? "50%"
        : settings.shape === "square"
          ? "8px"
          : "60% 40% 30% 70% / 60% 30% 70% 40%",
    background:
      settings.shape === "lines"
        ? "transparent"
        : `${circleColor}40`,
    transform: `translate(-50%, -50%) scale(${rippleScaleAtTime(timeSeconds, settings.waveSpeed, index)})`,
    animation: "none",
  };
}

export default function InspiraRipple({ ripple, timeSeconds = 0, background = "transparent" }: Props) {
  const settings = { ...DEFAULT_INSPIRA_RIPPLE, ...ripple };
  const rootRef = useRef<HTMLDivElement>(null);
  const [sizeScale, setSizeScale] = useState(1);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const updateScale = () => {
      // Inspira's reference demo is 450px tall; scale the official pixel
      // parameters with the actual preview/export viewport height.
      const next = root.clientHeight > 0 ? root.clientHeight / 450 : 1;
      setSizeScale(next);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`inspira-ripple-root ${settings.shape === "lines" ? "inspira-ripple-lines" : "inspira-ripple-masked"}`}
      data-testid="inspira-ripple"
      ref={rootRef}
    >
      {Array.from({ length: settings.numberOfCircles }, (_, offset) => {
        const index = offset + 1;
        const style = rippleCircleStyle(settings, index, timeSeconds, background, sizeScale);
        return <span className={`inspira-ripple-circle ${settings.circleClass}`.trim()} style={style} key={index} />;
      })}
    </div>
  );
}
