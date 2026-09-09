import { useMemo, type CSSProperties } from "react";

type TextEffectProps = {
  baseColor: string;
  accentColor: string;
  speed: number;
  timeSeconds: number;
  loopDuration: number;
  background: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
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
  fontFamily = "Inter",
}: TextEffectProps) {
  const phase =
    loopDuration > 0 ? (timeSeconds % loopDuration) / loopDuration : 0;
  const eased = phase < 0.5 ? 2 * phase * phase : 1 - (-2 * phase + 2) ** 2 / 2;
  const maskPosition = `${200 - eased * 300}%`;
  const textStyle: CSSProperties = {
    fontFamily: `'${fontFamily}', ui-sans-serif, system-ui, sans-serif`,
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
  fontFamily = "Inter",
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
  const blink = Math.floor(timeSeconds / 0.4) % 2 === 0;
  return (
    <div className="motion-root" style={centered(background)}>
      <div
        style={{
          color: baseColor,
          fontFamily: `'${fontFamily}', ui-sans-serif, system-ui, sans-serif`,
          fontSize: `clamp(28px, ${fontSize / 12}vw, ${fontSize}px)`,
          lineHeight: 1.4,
          letterSpacing: "-0.025em",
          whiteSpace: "pre-wrap",
        }}
      >
        <span style={{ color: accentColor }}>
          {phrase.slice(0, visibleCount)}
        </span>
        <span
          style={{
            color: accentColor,
            display: "inline-block",
            marginLeft: "0.25rem",
            letterSpacing: 0,
            visibility: blink ? "visible" : "hidden",
          }}
        >
          _
        </span>
      </div>
    </div>
  );
}

export function TextRing({
  baseColor,
  timeSeconds,
  loopDuration,
  background,
  text = "CIRCULAR|TEXT",
  fontSize = 24,
  fontFamily = "Inter",
}: TextEffectProps) {
  const words = text.split("|").map((word) => word.trim()).filter(Boolean);
  const phrase = `${(words.length ? words : ["CIRCULAR", "TEXT"]).join(" ⁕ ")} ⁕ `;
  const diameter = Math.max(180, fontSize * 13.333);
  const layout = useMemo(() => {
    const circumference = Math.PI * Math.max(8, diameter - fontSize * 1.1);
    const context = document.createElement("canvas").getContext("2d");
    if (context) context.font = `900 ${fontSize}px '${fontFamily}', sans-serif`;
    const unit = Array.from(phrase);
    const unitWidth = unit.reduce(
      (sum, character) => sum + (context?.measureText(character).width ?? fontSize * 0.55),
      0,
    );
    const repeats = Math.max(1, Math.ceil(circumference / Math.max(1, unitWidth)));
    const letters = Array.from(phrase.repeat(repeats));
    const widths = letters.map(
      (character) => context?.measureText(character).width ?? fontSize * 0.55,
    );
    const spacing = Math.max(0, (circumference - widths.reduce((a, b) => a + b, 0)) / letters.length);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * letters.length;
    let offset = 0;
    return letters.map((character, index) => {
      const angle = ((offset + widths[index] / 2) / total) * 360;
      offset += widths[index] + spacing;
      return { character, angle };
    });
  }, [diameter, fontFamily, fontSize, phrase]);
  const rotation = ((timeSeconds / Math.max(0.001, loopDuration)) * 360) % 360;
  return (
    <div className="motion-root" style={centered(background)}>
      <div
        style={{
          position: "relative",
          width: `min(72%, ${diameter}px)`,
          aspectRatio: "1",
          color: baseColor,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        {layout.map(({ character, angle }, index) => {
          return (
            <span
              key={`${character}-${index}`}
              style={{ position: "absolute", inset: fontSize * 0.55, transform: `rotate(${angle + 90}deg)` }}
            >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                fontFamily: `'${fontFamily}', ui-sans-serif, system-ui, sans-serif`,
                fontSize,
                fontWeight: 900,
                lineHeight: 1,
                whiteSpace: "pre",
                transform: "translate(-50%, -50%)",
              }}
            >
              {character === " " ? "\u00a0" : character}
            </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export type { TextEffectProps };
