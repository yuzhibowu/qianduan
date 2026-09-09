import { useMemo, type CSSProperties } from "react";
import { DEFAULT_APPEARANCE, type SurfaceAppearance } from "../appearance";

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
  appearance?: SurfaceAppearance;
  previewScale?: number;
};

function materialTextStyle(appearance: SurfaceAppearance): CSSProperties {
  if (!appearance.enabled) return {};
  const { preset, color, metallic, roughness, opacity } = appearance.material;
  const highlight = metallic > 0.5 ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.62)";
  const shadow = Math.round(1 + roughness * 3);
  const backgrounds: Record<string, string> = {
    gold: `linear-gradient(115deg, #6d4d00 0%, ${color} 26%, #fff2a0 45%, #9a6c00 66%, ${color} 100%)`,
    silver: `linear-gradient(115deg, #646a72 0%, ${color} 28%, #ffffff 46%, #858b93 68%, ${color} 100%)`,
    copper: `linear-gradient(115deg, #55270f 0%, ${color} 28%, #ffd0a4 47%, #7f3d1d 68%, ${color} 100%)`,
    stainless: `linear-gradient(105deg, #565d64 0%, ${color} 22%, #f7f8f9 43%, #777e85 61%, #d9dde0 100%)`,
    glass: `linear-gradient(110deg, rgba(255,255,255,.24), ${color} 35%, rgba(255,255,255,.98) 48%, rgba(238,244,250,.28) 70%)`,
    frostedGlass: `linear-gradient(115deg, #b7bbc0 0%, ${color} 32%, #ffffff 51%, #c5c9cd 74%, ${color} 100%)`,
    wood: `repeating-linear-gradient(96deg, #4c2d16 0 5px, ${color} 6px 13px, #b47a42 14px 17px, #65401f 18px 25px)`,
    plastic: `linear-gradient(120deg, ${color} 0%, ${highlight} 43%, ${color} 58%, #aeb0b5 100%)`,
  };
  return {
    color: "transparent",
    backgroundImage: backgrounds[preset] ?? backgrounds.plastic,
    backgroundSize: preset === "wood" ? "140px 100%" : "220% 100%",
    backgroundPosition: "center",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    opacity,
    filter: `drop-shadow(0 ${shadow}px ${shadow + 1}px rgba(0,0,0,${0.12 + metallic * 0.2}))`,
  };
}

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
  appearance = DEFAULT_APPEARANCE,
  previewScale = 1,
}: TextEffectProps) {
  const phase =
    loopDuration > 0 ? (timeSeconds % loopDuration) / loopDuration : 0;
  const eased = phase < 0.5 ? 2 * phase * phase : 1 - (-2 * phase + 2) ** 2 / 2;
  const maskPosition = `${200 - eased * 300}%`;
  const textStyle: CSSProperties = {
    fontFamily: `'${fontFamily}', ui-sans-serif, system-ui, sans-serif`,
    fontSize: previewScale < 1
      ? `${fontSize * previewScale}px`
      : `clamp(28px, ${fontSize / 12}vw, ${fontSize}px)`,
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
        <span style={{ color: baseColor, ...materialTextStyle(appearance) }}>{text}</span>
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
  appearance = DEFAULT_APPEARANCE,
  previewScale = 1,
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
          fontSize: previewScale < 1
            ? `${fontSize * previewScale}px`
            : `clamp(28px, ${fontSize / 12}vw, ${fontSize}px)`,
          lineHeight: 1.4,
          letterSpacing: "-0.025em",
          whiteSpace: "pre-wrap",
        }}
      >
        <span style={{ color: accentColor, ...materialTextStyle(appearance) }}>
          {phrase.slice(0, visibleCount)}
        </span>
        <span
          style={{
            color: accentColor,
            display: "inline-block",
            marginLeft: "0.25rem",
            letterSpacing: 0,
            visibility: blink ? "visible" : "hidden",
            ...materialTextStyle(appearance),
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
  appearance = DEFAULT_APPEARANCE,
  previewScale = 1,
}: TextEffectProps) {
  const words = text.split("|").map((word) => word.trim()).filter(Boolean);
  const phrase = `${(words.length ? words : ["CIRCULAR", "TEXT"]).join(" ⁕ ")} ⁕ `;
  const renderedFontSize = fontSize * previewScale;
  const diameter = Math.max(180 * previewScale, renderedFontSize * 13.333);
  const layout = useMemo(() => {
    const circumference = Math.PI * Math.max(8, diameter - renderedFontSize * 1.1);
    const context = document.createElement("canvas").getContext("2d");
    if (context) context.font = `900 ${renderedFontSize}px '${fontFamily}', sans-serif`;
    const unit = Array.from(phrase);
    const unitWidth = unit.reduce(
      (sum, character) => sum + (context?.measureText(character).width ?? renderedFontSize * 0.55),
      0,
    );
    const repeats = Math.max(1, Math.ceil(circumference / Math.max(1, unitWidth)));
    const letters = Array.from(phrase.repeat(repeats));
    const widths = letters.map(
      (character) => context?.measureText(character).width ?? renderedFontSize * 0.55,
    );
    const spacing = Math.max(0, (circumference - widths.reduce((a, b) => a + b, 0)) / letters.length);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * letters.length;
    let offset = 0;
    return letters.map((character, index) => {
      const angle = ((offset + widths[index] / 2) / total) * 360;
      offset += widths[index] + spacing;
      return { character, angle };
    });
  }, [diameter, fontFamily, renderedFontSize, phrase]);
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
              style={{ position: "absolute", inset: renderedFontSize * 0.55, transform: `rotate(${angle + 90}deg)` }}
            >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                fontFamily: `'${fontFamily}', ui-sans-serif, system-ui, sans-serif`,
                fontSize: renderedFontSize,
                fontWeight: 900,
                lineHeight: 1,
                whiteSpace: "pre",
                transform: "translate(-50%, -50%)",
                ...materialTextStyle(appearance),
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
