import type { CSSProperties } from "react";

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
};

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
}: Props) {
  const progress = max === min ? 0 : (value - min) / (max - min);
  const split = `calc(${progress * 100}% + ${THUMB / 2 - THUMB * progress}px)`;
  const style = { "--split": split } as CSSProperties;
  return (
    <div className={`slider-field ${className}`}>
      <div className="slider-head">
        <span>{label}</span>
        <output>{display ?? value}</output>
      </div>
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
