import { createContext, useContext, type CSSProperties } from "react";

export const SliderResetScope = createContext("global");

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  ariaLabel?: string;
  onChange: (value: number) => void;
  snaps?: { value: number; label: string }[];
  snapThreshold?: number;
  className?: string;
  defaultValue?: number;
};

const capturedDefaults = new Map<string, number>();

const THUMB = 16;

export default function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  ariaLabel,
  onChange,
  snaps,
  snapThreshold = 0,
  className = "",
  defaultValue,
}: Props) {
  const resetScope = useContext(SliderResetScope);
  const resetKey = `${resetScope}:${label}`;
  if (!capturedDefaults.has(resetKey)) capturedDefaults.set(resetKey, defaultValue ?? value);
  const resetValue = defaultValue ?? capturedDefaults.get(resetKey) ?? value;
  const progress = max === min ? 0 : (value - min) / (max - min);
  const split = `calc(${progress * 100}% + ${THUMB / 2 - THUMB * progress}px)`;
  const style = { "--split": split } as CSSProperties;
  return (
    <div className={`slider-field ${className}`}>
      <button
        type="button"
        className="slider-head slider-reset"
        title="恢复默认值"
        aria-label={`${label}，恢复默认值`}
        onClick={() => onChange(resetValue)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onChange(resetValue);
        }}
      >
        <span>{label}</span>
        <output>{display ?? value}</output>
      </button>
      <input
        className="slider"
        aria-label={ariaLabel ?? label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={style}
        onChange={(event) => {
          const raw = Number(event.target.value);
          const nearest = snaps?.reduce((best, snap) =>
            Math.abs(snap.value - raw) < Math.abs(best.value - raw)
              ? snap
              : best,
          );
          onChange(
            nearest && Math.abs(nearest.value - raw) <= snapThreshold
              ? nearest.value
              : raw,
          );
        }}
      />
      {snaps && (
        <div className="slider-snaps">
          {snaps.map((snap) => {
            const p = max === min ? 0 : (snap.value - min) / (max - min);
            const left = `calc(${p * 100}% + ${THUMB / 2 - THUMB * p}px)`;
            const active = Math.abs(value - snap.value) <= (max - min) * 0.015;
            return (
              <span
                key={snap.value}
                className={active ? "active" : ""}
                style={{ left }}
              >
                <i />
                {snap.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
