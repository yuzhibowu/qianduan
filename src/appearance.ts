export type MaterialPresetId =
  | "gold"
  | "silver"
  | "copper"
  | "glass"
  | "frostedGlass"
  | "wood"
  | "plastic"
  | "stainless";

export type MaterialAppearance = {
  preset: MaterialPresetId;
  color: string;
  metallic: number;
  roughness: number;
  opacity: number;
  ior: number;
};

export type SurfaceAppearance = {
  enabled: boolean;
  material: MaterialAppearance;
  frontTexture?: string;
  backTexture?: string;
};

export const MATERIAL_PRESETS: Record<
  MaterialPresetId,
  MaterialAppearance & { label: string }
> = {
  gold: { label: "黄金", preset: "gold", color: "#D4A928", metallic: 1, roughness: 0.18, opacity: 1, ior: 1.5 },
  silver: { label: "白银", preset: "silver", color: "#D7DBE0", metallic: 1, roughness: 0.16, opacity: 1, ior: 1.5 },
  copper: { label: "黄铜", preset: "copper", color: "#B87333", metallic: 1, roughness: 0.24, opacity: 1, ior: 1.5 },
  glass: { label: "玻璃", preset: "glass", color: "#F6FBFF", metallic: 0, roughness: 0.04, opacity: 0.32, ior: 1.5 },
  frostedGlass: { label: "磨砂玻璃", preset: "frostedGlass", color: "#DDE1E5", metallic: 0, roughness: 0.68, opacity: 0.58, ior: 1.5 },
  wood: { label: "木头", preset: "wood", color: "#8B5A2B", metallic: 0, roughness: 0.72, opacity: 1, ior: 1.45 },
  plastic: { label: "塑料", preset: "plastic", color: "#E8E8EA", metallic: 0, roughness: 0.34, opacity: 1, ior: 1.46 },
  stainless: { label: "不锈钢", preset: "stainless", color: "#AEB4BA", metallic: 1, roughness: 0.32, opacity: 1, ior: 1.5 },
};

export const DEFAULT_APPEARANCE: SurfaceAppearance = {
  enabled: false,
  material: { ...MATERIAL_PRESETS.silver },
};

export function materialFromPreset(id: MaterialPresetId): MaterialAppearance {
  const { label: _label, ...material } = MATERIAL_PRESETS[id];
  return { ...material };
}
