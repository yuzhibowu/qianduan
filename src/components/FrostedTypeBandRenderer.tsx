import type { BorderRendererProps } from "./BorderComponents";
import FrostedTypeBand from "./originkit/FrostedTypeBand";

export type FrostedTypeBandSettings = {
  items: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  letterSpacing: number;
  textColor: string;
  speed: number;
  distance: number;
  tilt: number;
  gap: number;
  fade: number;
  blur: number;
  refraction: number;
  tint: string;
  grain: number;
  damping: number;
  hover: number;
};

export const DEFAULT_FROSTED_TYPE_BAND: FrostedTypeBandSettings = {
  items: "DESIGN|MOTION|SYSTEMS|BRAND",
  fontSize: 16,
  fontFamily: "Inter",
  fontWeight: 700,
  fontStyle: "normal",
  letterSpacing: 0,
  textColor: "#FEFF00",
  speed: 100,
  distance: 810,
  tilt: 0,
  gap: 83,
  fade: 49,
  blur: 100,
  refraction: 50,
  tint: "#FAFAFF42",
  grain: 0,
  damping: 100,
  hover: 200,
};

export default function FrostedTypeBandRenderer({
  timeSeconds,
  frostedTypeBand,
}: BorderRendererProps & {
  frostedTypeBand?: Partial<FrostedTypeBandSettings>;
}) {
  const settings = { ...DEFAULT_FROSTED_TYPE_BAND, ...frostedTypeBand };
  return (
    <div className="motion-root frosted-type-band-root">
      <FrostedTypeBand
        items={settings.items
          .split("|")
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text) => ({ text }))}
        font={{
          fontFamily: settings.fontFamily,
          fontSize: settings.fontSize,
          fontWeight: settings.fontWeight,
          fontStyle: settings.fontStyle,
          letterSpacing: `${settings.letterSpacing}em`,
        }}
        textColor={settings.textColor}
        speed={settings.speed}
        distance={settings.distance}
        tilt={settings.tilt}
        gap={settings.gap}
        fade={settings.fade}
        glass={{
          blur: settings.blur,
          refraction: settings.refraction,
          tint: settings.tint,
          grain: settings.grain,
        }}
        cursor={{ damping: settings.damping, hover: settings.hover }}
        timeSeconds={timeSeconds}
        style={{ minWidth: 0, minHeight: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
