import type { CSSProperties } from "react";

type TextEffectProps = {
  baseColor: string;
  accentColor: string;
  speed: number;
  timeSeconds: number;
  loopDuration: number;
  background: string;
  text?: string;
  fontSize?: number;
};

function centered(background: string): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    background,
  };
}

export function ShinyPill({
  baseColor,
  accentColor,
  timeSeconds,
  loopDuration,
  background,
  text = "SHINY PILL",
  fontSize = 120,
}: TextEffectProps) {
  const phase =
    loopDuration > 0 ? (timeSeconds % loopDuration) / loopDuration : 0;
  const eased = phase < 0.5 ? 2 * phase * phase : 1 - (-2 * phase + 2) ** 2 / 2;
  const maskPosition = `${200 - eased * 300}%`;
  const textStyle: CSSProperties = {
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: `clamp(28px, ${fontSize / 12}vw, ${fontSize}px)`,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
  return (
    <div className="motion-root" style={centered(background)}>
      <div
        style={{ position: "relative", display: "inline-flex", ...textStyle }}
      >
        <span style={{ color: baseColor }}>{text}</span>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            color: accentColor,
            WebkitMaskImage:
              "linear-gradient(to right, transparent 30%, #000 50%, transparent 70%)",
            maskImage:
              "linear-gradient(to right, transparent 30%, #000 50%, transparent 70%)",
            WebkitMaskSize: "150% auto",
            maskSize: "150% auto",
            WebkitMaskPosition: maskPosition,
            maskPosition,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}

export function Typewriter({
  baseColor,
  accentColor,
  timeSeconds,
  loopDuration,
  background,
  text = "Interfaces|Experiences|Interactions|Products",
  fontSize = 80,
}: TextEffectProps) {
  const phrases = text
    .split("|")
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  const safePhrases = phrases.length ? phrases : ["Interfaces"];
  const weights = safePhrases.map((phrase) => phrase.length * 2 + 18);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let cursor =
    ((timeSeconds % Math.max(0.001, loopDuration)) /
      Math.max(0.001, loopDuration)) *
    totalWeight;
  let phraseIndex = 0;
  while (phraseIndex < weights.length - 1 && cursor >= weights[phraseIndex]) {
    cursor -= weights[phraseIndex];
    phraseIndex += 1;
  }
  const phrase = safePhrases[phraseIndex];
  const typingEnd = phrase.length;
  const holdEnd = typingEnd + 12;
  const deletingEnd = holdEnd + phrase.length;
  const visibleCount =
    cursor < typingEnd
      ? Math.floor(cursor)
      : cursor < holdEnd
        ? phrase.length
        : cursor < deletingEnd
          ? Math.max(0, phrase.length - Math.floor(cursor - holdEnd))
          : 0;
  const isTyping =
    cursor < typingEnd || (cursor >= holdEnd && cursor < deletingEnd);
  const blink = Math.floor(timeSeconds / 0.4) % 2 === 0;
  return (
    <div className="motion-root" style={centered(background)}>
      <div
        style={{
          color: baseColor,
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: `clamp(28px, ${fontSize / 12}vw, ${fontSize}px)`,
          lineHeight: 1.4,
          letterSpacing: "-0.025em",
          whiteSpace: "pre-wrap",
        }}
      >
        <span style={{ color: accentColor }}>
          {phrase.slice(0, visibleCount)}
        </span>
        <span style={{ visibility: isTyping || blink ? "visible" : "hidden" }}>
          _
        </span>
      </div>
    </div>
  );
}

export type { TextEffectProps };
