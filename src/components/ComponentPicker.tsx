import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { MotionComponentDefinition } from "../component-registry";
import type { BorderRendererProps } from "./BorderComponents";
import { DEFAULT_PAPER_IMAGE, PAPER_IMAGE_LOOP_DURATION } from "./PaperImageRenderer";
import { DEFAULT_INSPIRA_RIPPLE } from "./InspiraRipple";

type Option = MotionComponentDefinition;

type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
};

const PREVIEW_PRESETS: Record<string, Partial<BorderRendererProps>> = {
  "coin-loader": { baseColor: "#ffffff", accentColor: "#ffffff", speed: 100 },
  "disc-split": { baseColor: "#ffffff", accentColor: "#ffffff", speed: 50 },
  "gyro-loader": { baseColor: "#ffffff", accentColor: "#ffffff", speed: 50 },
  typewriter: { baseColor: "#ffffff", accentColor: "#ffffff", speed: 50 },
  "text-ring": { baseColor: "#ffffff", accentColor: "#ffffff", speed: 20 },
  "shiny-pill": { baseColor: "#ffffff", accentColor: "#78ff83", speed: 1.5 },
  "glow-border": {
    baseColor: "#00edff",
    accentColor: "#00ffe8",
    speed: 10,
    borderWidth: 5,
    rounded: 0,
    glow: 50,
  },
  "neon-border": {
    baseColor: "#cc9149",
    accentColor: "#cc9149",
    speed: 16,
    borderWidth: 6,
    rounded: 24,
    glow: 100,
  },
  "pulsating-border": {
    baseColor: "#f2244f",
    accentColor: "#4da6e6",
    speed: 1,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
  },
  "light-bloom": {
    baseColor: "#6b2bf5",
    accentColor: "#efe6ff",
    speed: 100,
  },
  "frosted-type-band": {
    baseColor: "#feff00",
    accentColor: "#fafaff",
    speed: 100,
  },
};

const PREVIEW_DURATIONS: Record<string, number> = {
  "coin-loader": 10.472,
  "disc-split": 3,
  "gyro-loader": 2.45,
  typewriter: 12,
  "text-ring": 20,
  "shiny-pill": 1.5,
  "glow-border": 10,
  "neon-border": 9.474,
  "pulsating-border": 10,
  "light-bloom": 10,
  "frosted-type-band": 19.635,
  "paper-image": PAPER_IMAGE_LOOP_DURATION,
};

function AnimatedPreview({ option }: { option: Option }) {
  const [timeSeconds, setTimeSeconds] = useState(0);
  const Renderer = option.renderer;
  useEffect(() => {
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      setTimeSeconds((now - startedAt) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [option.id]);
  const isGyro = option.id === "gyro-loader";
  const isTypewriter = option.id === "typewriter";
  const isTextRing = option.id === "text-ring";
  const isShiny = option.id === "shiny-pill";
  const isText = option.category === "Text";
  const isBorder = option.category === "Particle";
  const preset = PREVIEW_PRESETS[option.id] ?? PREVIEW_PRESETS["coin-loader"];
  return (
    <div className="component-picker-preview-stage">
      <Renderer
        baseColor={preset.baseColor ?? "#ffffff"}
        accentColor={preset.accentColor ?? "#ffffff"}
        speed={preset.speed ?? 50}
        distance={isBorder ? 30 : 20}
        timeSeconds={timeSeconds}
        loopDuration={PREVIEW_DURATIONS[option.id] ?? 4}
        background="transparent"
        canvasAspect={16 / 9}
        borderAspect={16 / 9}
        borderWidth={preset.borderWidth}
        rounded={preset.rounded}
        glow={preset.glow}
        coins={
          isGyro
            ? { count: 4, coinSize: 100, spread: 150, ringSpeed: 500 }
            : { count: 8, coinSize: 100, spread: 100, ringSpeed: 50 }
        }
        disc={{ count: 6, innerRadius: 22, thickness: 100, burst: 100 }}
        text={isTypewriter ? "Interfaces|Experiences" : isTextRing ? "CIRCULAR|TEXT" : "SHINY PILL"}
        fontSize={isTypewriter ? 38 : isTextRing ? 12 : 42}
        fontFamily="PingFang SC"
        previewScale={option.id === "paper-image" ? 0.12 : isText ? 0.62 : 1}
        frostedTypeBand={
          option.id === "frosted-type-band"
            ? {
                fontSize: 16,
                items: "DESIGN|MOTION|SYSTEMS|BRAND",
              }
            : undefined
        }
        paperImage={
          option.id === "paper-image"
            ? DEFAULT_PAPER_IMAGE
            : undefined
        }
        ripple={
          option.id === "inspira-ripple"
            ? { ...DEFAULT_INSPIRA_RIPPLE, circleColor: "#FFFFFF" }
            : undefined
        }
      />
    </div>
  );
}

export default function ComponentPicker({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [preview, setPreview] = useState<{
    option: Option;
    x: number;
    y: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    setFocusedIndex(selectedIndex);
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, selectedIndex]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.id);
    setOpen(false);
    setPreview(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(focusedIndex);
      else setOpen(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setFocusedIndex(selectedIndex);
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setFocusedIndex(
        (index) => (index + direction + options.length) % options.length,
      );
    }
  };

  return (
    <div className="component-picker" ref={rootRef}>
      <button
        type="button"
        className="component-picker-trigger"
        aria-label="组件"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.name}</span>
        <span className={`component-picker-arrow ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div
          className="component-picker-menu"
          role="listbox"
          aria-label="组件"
          onPointerLeave={() => setPreview(null)}
        >
          {options.map((option, index) => {
            const isSelected = option.id === value;
            return (
              <div className="component-picker-item" key={option.id}>
                {index > 0 &&
                  options[index - 1].category !== option.category && (
                    <div
                      className="component-picker-divider"
                      aria-hidden="true"
                    />
                  )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`component-picker-option ${isSelected ? "selected" : ""} ${focusedIndex === index ? "focused" : ""}`}
                  onPointerEnter={(event) => {
                    setFocusedIndex(index);
                    setPreview({
                      option,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                  onPointerMove={(event) =>
                    setPreview({
                      option,
                      x: event.clientX,
                      y: event.clientY,
                    })
                  }
                  onClick={() => choose(index)}
                >
                  {option.name}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {open && preview && (
        <div
          className="component-picker-preview"
          style={{
            left: Math.min(preview.x + 16, window.innerWidth - 204),
            top: Math.min(
              Math.max(12, preview.y - 56),
              window.innerHeight - 132,
            ),
          }}
        >
          <AnimatedPreview key={preview.option.id} option={preview.option} />
          <span>{preview.option.name}</span>
        </div>
      )}
    </div>
  );
}
