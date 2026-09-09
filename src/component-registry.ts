import CoinLoader from "./components/CoinLoader";
import {
  GlowBorder,
  NeonBorder,
  PulsatingBorder,
  type BorderRendererProps,
} from "./components/BorderComponents";
import type { ComponentType } from "react";
import DiscSplit from "./components/DiscSplit";
import GyroLoader from "./components/GyroLoader";
import { ShinyPill, TextRing, Typewriter } from "./components/TextEffects";

export type ExportCapability = "mov" | "apng" | "usdz";

export type MotionComponentDefinition = {
  id: string;
  name: string;
  category: "3D" | "Text" | "Image" | "Particle" | "Background" | "Interaction";
  source: "OriginKit";
  poster: string;
  renderer: ComponentType<
    BorderRendererProps & {
      coins?: {
        count: number;
        coinSize: number;
        spread: number;
        ringSpeed: number;
      };
      disc?: {
        count: number;
        innerRadius: number;
        thickness: number;
        burst: number;
      };
      text?: string;
      fontSize?: number;
      fontFamily?: string;
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
    poster: "https://cdn.originkit.dev/components/coin-loader-poster.jpg",
    renderer: CoinLoader,
    exportCapabilities: ["mov", "apng", "usdz"],
    triggerMode: "auto",
  },
  {
    id: "disc-split",
    name: "Disc Split",
    category: "3D",
    source: "OriginKit",
    poster: "https://cdn.originkit.dev/components/disc-split-poster.jpg",
    renderer: DiscSplit,
    exportCapabilities: ["mov", "apng", "usdz"],
    triggerMode: "auto",
  },
  {
    id: "gyro-loader",
    name: "Gyro Loader",
    category: "3D",
    source: "OriginKit",
    poster: "https://cdn.originkit.dev/components/gyro-loader-poster.jpg",
    renderer: GyroLoader,
    exportCapabilities: ["mov", "apng", "usdz"],
    triggerMode: "auto",
  },
  {
    id: "typewriter",
    name: "Typewriter",
    category: "Text",
    source: "OriginKit",
    poster:
      "https://cdn.originkit.dev/components/typewriter-gallery-poster.jpg?v=mszok3qm",
    renderer: Typewriter,
    exportCapabilities: ["mov", "apng"],
    triggerMode: "auto",
  },
  {
    id: "text-ring",
    name: "Text Ring",
    category: "Text",
    source: "OriginKit",
    poster: "https://cdn.originkit.dev/components/text-ring-poster.jpg",
    renderer: TextRing,
    exportCapabilities: ["mov", "apng"],
    triggerMode: "auto",
  },
  {
    id: "shiny-pill",
    name: "Shiny Pill",
    category: "Text",
    source: "OriginKit",
    poster:
      "https://cdn.originkit.dev/components/shiny-pill-gallery-poster.jpg?v=mszohxcu",
    renderer: ShinyPill,
    exportCapabilities: ["mov", "apng"],
    triggerMode: "auto",
  },
  {
    id: "glow-border",
    name: "Glow Border",
    category: "Particle",
    source: "OriginKit",
    poster: "https://cdn.originkit.dev/components/glow-border-poster.jpg",
    renderer: GlowBorder,
    exportCapabilities: ["mov", "apng"],
    triggerMode: "auto",
  },
  {
    id: "neon-border",
    name: "Neon Border",
    category: "Particle",
    source: "OriginKit",
    poster: "https://cdn.originkit.dev/components/neon-border-poster.jpg",
    renderer: NeonBorder,
    exportCapabilities: ["mov", "apng"],
    triggerMode: "auto",
  },
  {
    id: "pulsating-border",
    name: "Pulsating Border",
    category: "Particle",
    source: "OriginKit",
    poster: "https://cdn.originkit.dev/components/pulsating-border-poster.jpg",
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
