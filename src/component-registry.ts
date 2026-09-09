import CoinLoader from "./components/CoinLoader";
import {
  GlowBorder,
  NeonBorder,
  PulsatingBorder,
  type BorderRendererProps,
} from "./components/BorderComponents";
import type { ComponentType } from "react";

export type ExportCapability = "mov" | "apng" | "usdz";

export type MotionComponentDefinition = {
  id: string;
  name: string;
  category: "3D" | "Text" | "Image" | "Particle";
  source: "OriginKit";
  renderer: ComponentType<
    BorderRendererProps & {
      coins?: {
        count: number;
        coinSize: number;
        spread: number;
        ringSpeed: number;
      };
    }
  >;
  exportCapabilities: ExportCapability[];
  triggerMode: "auto";
};

export const componentRegistry: MotionComponentDefinition[] = [
  {
    id: "coin-loader",
    name: "Coin Loader",
    category: "3D",
    source: "OriginKit",
    renderer: CoinLoader,
    exportCapabilities: ["mov", "apng", "usdz"],
    triggerMode: "auto",
  },
  {
    id: "glow-border",
    name: "Glow Border",
    category: "Particle",
    source: "OriginKit",
    renderer: GlowBorder,
    exportCapabilities: ["mov", "apng"],
    triggerMode: "auto",
  },
  {
    id: "neon-border",
    name: "Neon Border",
    category: "Particle",
    source: "OriginKit",
    renderer: NeonBorder,
    exportCapabilities: ["mov", "apng"],
    triggerMode: "auto",
  },
  {
    id: "pulsating-border",
    name: "Pulsating Border",
    category: "Particle",
    source: "OriginKit",
    renderer: PulsatingBorder,
    exportCapabilities: ["mov", "apng"],
    triggerMode: "auto",
  },
];

export const defaultComponent = componentRegistry[0];

export function getMotionComponent(id: string) {
  return (
    componentRegistry.find((component) => component.id === id) ??
    defaultComponent
  );
}
