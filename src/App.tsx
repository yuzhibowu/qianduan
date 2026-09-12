import { useEffect, useMemo, useRef, useState } from "react";
import Slider, { SliderResetScope } from "./components/Slider";
import { DEFAULT_LOOP_DURATION, rotationsPerCycle } from "./time";
import {
  buildCoinUsdz,
  buildDiscSplitUsdz,
  buildFrostedTypeBandUsdz,
  buildGyroLoaderUsdz,
  downloadUsdz,
} from "./usdz";
import { DEFAULT_COMP, FREEFORM_COMP, type ColorComp } from "./lib/color";
import { componentRegistry, getMotionComponent } from "./component-registry";
import {
  cancelBrowserExport,
  exportInBrowser,
  type BrowserExportFormat,
  type BrowserExportProgress,
} from "./browser-export";
import ComponentPicker from "./components/ComponentPicker";
import LocalFontPicker from "./components/LocalFontPicker";
import type { InteractionSample } from "./interaction";
import { DEFAULT_LIGHT_BLOOM, type LightBloomSettings } from "./components/LightBloom";
import {
  DEFAULT_FROSTED_TYPE_BAND,
  type FrostedTypeBandSettings,
} from "./components/FrostedTypeBandRenderer";
import { DEFAULT_PAPER_IMAGE, PAPER_IMAGE_LOOP_DURATION, type PaperImageSettings } from "./components/PaperImageRenderer";
import { DEFAULT_INSPIRA_RIPPLE, type InspiraRippleSettings } from "./components/InspiraRipple";
import { DEFAULT_DISC_CURVE, type DiscCurveSettings } from "./disc-curve";
import DiscCurveEditor from "./components/DiscCurveEditor";
import {
  alphaRoundedPercent,
  displayIllustrationAspect,
  visibleAlphaBounds,
  type BorderIllustration,
} from "./border-illustration";
import {
  DEFAULT_APPEARANCE,
  MATERIAL_PRESETS,
  materialFromPreset,
  type MaterialPresetId,
  type SurfaceAppearance,
} from "./appearance";
import { adaptNeonToAspect } from "./neon-adaptation";
import { borderLoopDuration, neonLoopDuration } from "./border-timing";
import {
  inspectShinyGraphic,
  shinyGraphicKind,
  type ShinyGraphic,
} from "./shiny-graphic";

type ColorTarget = "keynote" | "freeform";
type ShinyContentMode = "text" | "graphic";
type ExportJob = BrowserExportProgress & {
  running: boolean;
  outputPath: string;
  framesPath: string;
  error: string;
};

const emptyExportJob = (): ExportJob => ({
  running: false,
  stage: "准备就绪",
  frame: 0,
  totalFrames: 0,
  progress: 0,
  outputPath: "",
  framesPath: "",
  error: "",
});

type ComponentControls = {
  baseColor: string;
  accentColor: string;
  speed: number;
  ringSpeed: number;
  distance: number;
  count: number;
  coinSize: number;
  spread: number;
  borderWidth: number;
  rounded: number;
  glow: number;
  neonLength?: number;
  neonPosition?: number;
  borderAspect: number;
  innerRadius: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontFace?: string;
  fontWeight?: number;
  duration: number;
};

const BORDER_ASPECT_SNAPS = [
  { value: 1 / 3, label: "1:3" },
  { value: 1 / 2, label: "1:2" },
  { value: 9 / 16, label: "9:16" },
  { value: 3 / 4, label: "3:4" },
  { value: 1, label: "1:1" },
  { value: 4 / 3, label: "4:3" },
  { value: 16 / 9, label: "16:9" },
  { value: 2, label: "2:1" },
  { value: 3, label: "3:1" },
];
const BORDER_DEFAULT_DURATIONS: Record<string, number> = {
  "glow-border": 10,
  "neon-border": neonLoopDuration(16),
  "pulsating-border": 10,
};

function colorCodeInk(hex: string) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 155 ? "#000" : "#fff";
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取 PNG"));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取 PNG"));
    reader.readAsDataURL(file);
  });
}

async function inspectBorderIllustration(file: File): Promise<BorderIllustration> {
  if (file.type !== "image/png") throw new Error("只支持 PNG 图片或 PNG 动图");
  const src = await readDataUrl(file);
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法分析 PNG 透明区域");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const bounds = visibleAlphaBounds(pixels, canvas.width, canvas.height);
  return {
    src,
    name: file.name || "剪贴板 PNG",
    naturalWidth: canvas.width,
    naturalHeight: canvas.height,
    bounds,
    aspect: bounds.width / Math.max(1, bounds.height),
    rounded: alphaRoundedPercent(pixels, canvas.width, bounds),
  };
}

const COMPONENT_DEFAULTS: Record<string, ComponentControls> = {
  "coin-loader": {
    baseColor: "#FFFFFF",
    accentColor: "#FFFFFF",
    speed: 100,
    ringSpeed: 50,
    distance: 20,
    count: 8,
    coinSize: 100,
    spread: 100,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    duration: DEFAULT_LOOP_DURATION,
  },
  "disc-split": {
    baseColor: "#FFFFFF",
    accentColor: "#FFFFFF",
    speed: 50,
    ringSpeed: 50,
    distance: 20,
    count: 6,
    coinSize: 90,
    spread: 71,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    duration: 3,
  },
  "gyro-loader": {
    baseColor: "#FFFFFF",
    accentColor: "#FFFFFF",
    speed: 50,
    ringSpeed: 500,
    distance: 20,
    count: 4,
    coinSize: 100,
    spread: 150,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    duration: 2.45,
  },
  typewriter: {
    baseColor: "#FFFFFF",
    accentColor: "#FFFFFF",
    speed: 50,
    ringSpeed: 50,
    distance: 20,
    count: 8,
    coinSize: 100,
    spread: 100,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    text: "Interfaces|Experiences|Interactions|Products",
    fontSize: 80,
    fontFamily: "PingFang SC",
    fontFace: "",
    fontWeight: 400,
    duration: 12,
  },
  "text-ring": {
    baseColor: "#FFFFFF",
    accentColor: "#FFFFFF",
    speed: 20,
    ringSpeed: 50,
    distance: 20,
    count: 8,
    coinSize: 100,
    spread: 100,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    text: "CIRCULAR|TEXT",
    fontSize: 24,
    fontFamily: "PingFang SC",
    fontFace: "",
    fontWeight: 900,
    duration: 20,
  },
  "shiny-pill": {
    baseColor: "#FFFFFF",
    accentColor: "#78FF83",
    speed: 1.5,
    ringSpeed: 50,
    distance: 20,
    count: 8,
    coinSize: 100,
    spread: 100,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    text: "SHINY PILL",
    fontSize: 120,
    fontFamily: "PingFang SC",
    fontFace: "",
    fontWeight: 700,
    duration: 1.5,
  },
  "glow-border": {
    baseColor: "#00EDFF",
    accentColor: "#00FFE8",
    speed: 10,
    ringSpeed: 50,
    distance: 20,
    count: 8,
    coinSize: 100,
    spread: 100,
    borderWidth: 5,
    rounded: 0,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    duration: BORDER_DEFAULT_DURATIONS["glow-border"],
  },
  "neon-border": {
    baseColor: "#CC9149",
    accentColor: "#CC9149",
    speed: 16,
    ringSpeed: 50,
    distance: 20,
    count: 8,
    coinSize: 100,
    spread: 100,
    borderWidth: 6,
    rounded: 24,
    glow: 100,
    neonLength: 50,
    neonPosition: 0,
    borderAspect: 16 / 9,
    innerRadius: 31,
    duration: BORDER_DEFAULT_DURATIONS["neon-border"],
  },
  "pulsating-border": {
    baseColor: "#F2244F",
    accentColor: "#4DA6E6",
    speed: 1,
    ringSpeed: 50,
    distance: 20,
    count: 8,
    coinSize: 100,
    spread: 100,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    duration: BORDER_DEFAULT_DURATIONS["pulsating-border"],
  },
  "light-bloom": {
    baseColor: "#6B2BF5",
    accentColor: "#EFE6FF",
    speed: 100,
    ringSpeed: 50,
    distance: 20,
    count: 9,
    coinSize: 100,
    spread: 72,
    borderWidth: 5,
    rounded: 35,
    glow: 70,
    borderAspect: 16 / 9,
    innerRadius: 31,
    duration: 10,
  },
  "frosted-type-band": {
    baseColor: "#FEFF00",
    accentColor: "#FAFAFF",
    speed: 100,
    ringSpeed: 50,
    distance: 20,
    count: 4,
    coinSize: 100,
    spread: 100,
    borderWidth: 5,
    rounded: 35,
    glow: 50,
    borderAspect: 16 / 9,
    innerRadius: 31,
    text: "DESIGN|MOTION|SYSTEMS|BRAND",
    fontSize: 16,
    fontFamily: "Inter",
    fontFace: "",
    fontWeight: 700,
    duration: 19.635,
  },
  "paper-image": {
    baseColor: "#FFFFFF", accentColor: "#FFFFFF", speed: 100, ringSpeed: 50,
    distance: 20, count: 1, coinSize: 100, spread: 100, borderWidth: 5,
    rounded: 0, glow: 0, borderAspect: 340 / 440, innerRadius: 0, duration: PAPER_IMAGE_LOOP_DURATION,
  },
  "inspira-ripple": {
    baseColor: "#000000", accentColor: "#000000", speed: 100, ringSpeed: 50,
    distance: 20, count: 7, coinSize: 210, spread: 70, borderWidth: 1,
    rounded: 100, glow: 0, borderAspect: 16 / 9, innerRadius: 0, duration: 2,
  },
};
const colorProfileFor = (target: ColorTarget): ColorComp =>
  target === "keynote" ? DEFAULT_COMP : FREEFORM_COMP;

function displayDiscShare(value: number, count: number) {
  const equalShare = 1 / count;
  if (Math.abs(value - equalShare) < 0.0001 && !Number.isInteger(100 / count)) {
    return `1/${count}`;
  }
  return `${Number((value * 100).toFixed(2))}%`;
}

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const exportMode = query.get("render") === "frame";
  const exportTime = Number(query.get("time") ?? 0);
  const exportWidth = Number(query.get("width") ?? 1280);
  const exportHeight = Number(query.get("height") ?? 720);
  const queryComponent = query.get("component") ?? "coin-loader";
  const queryDefaults =
    COMPONENT_DEFAULTS[queryComponent] ?? COMPONENT_DEFAULTS["coin-loader"];
  const queryBaseColor = query.get("baseColor") ?? queryDefaults.baseColor;
  const queryAccentColor =
    query.get("accentColor") ?? queryDefaults.accentColor;
  const querySpeed = Number(query.get("speed") ?? queryDefaults.speed);
  const queryRingSpeed = Number(
    query.get("ringSpeed") ?? queryDefaults.ringSpeed,
  );
  const queryDistance = Number(query.get("distance") ?? queryDefaults.distance);
  const queryCount = Number(query.get("count") ?? queryDefaults.count);
  const queryDiscProportions: number[] = (() => {
    try {
      const parsed = JSON.parse(query.get("discProportions") ?? "[]") as number[];
      if (parsed.length === queryCount) return parsed;
    } catch { /* use equal shares */ }
    return Array.from({ length: queryCount }, () => 1 / queryCount);
  })();
  const queryDiscCurve: DiscCurveSettings = (() => {
    try { return { ...DEFAULT_DISC_CURVE, ...JSON.parse(query.get("discCurve") ?? "{}") }; }
    catch { return DEFAULT_DISC_CURVE; }
  })();
  const queryCoinSize = Number(query.get("coinSize") ?? queryDefaults.coinSize);
  const querySpread = Number(query.get("spread") ?? queryDefaults.spread);
  const queryBackground = query.get("background") ?? "transparent";
  const queryDuration = Number(query.get("duration") ?? queryDefaults.duration);
  const queryFps = Number(query.get("fps") ?? 30);
  const queryBorderWidth = Number(query.get("borderWidth") ?? 5);
  const queryRounded = Number(query.get("rounded") ?? 35);
  const queryGlow = Number(query.get("glow") ?? 50);
  const queryNeonLength = Number(query.get("neonLength") ?? queryDefaults.neonLength ?? 50);
  const queryNeonPosition = Number(query.get("neonPosition") ?? queryDefaults.neonPosition ?? 0);
  const queryBorderAspect = Number(query.get("borderAspect") ?? 16 / 9);
  const queryInnerRadius = Number(
    query.get("innerRadius") ?? queryDefaults.innerRadius,
  );
  const queryText = query.get("text") ?? queryDefaults.text ?? "";
  const queryFontSize = Number(
    query.get("fontSize") ?? queryDefaults.fontSize ?? 80,
  );
  const queryFontFamily =
    query.get("fontFamily") ?? queryDefaults.fontFamily ?? "PingFang SC";
  const queryFontFace = query.get("fontFace") ?? queryDefaults.fontFace ?? "";
  const queryFontWeight = Number(
    query.get("fontWeight") ?? queryDefaults.fontWeight ?? 400,
  );
  const queryInteractionTrack = (() => {
    try {
      return JSON.parse(query.get("interaction") ?? "[]") as InteractionSample[];
    } catch {
      return [];
    }
  })();
  const queryLightBloom: LightBloomSettings = {
    variant: query.get("bloomStyle") === "bloom" ? "bloom" : "shafts",
    direction: (["bottom", "top", "left", "right"].includes(query.get("bloomDirection") ?? "") ? query.get("bloomDirection") : "bottom") as LightBloomSettings["direction"],
    background: query.get("bloomBackground") ?? DEFAULT_LIGHT_BLOOM.background,
    hover: Number(query.get("bloomHover") ?? DEFAULT_LIGHT_BLOOM.hover),
    rise: Number(query.get("bloomRise") ?? DEFAULT_LIGHT_BLOOM.rise),
    spread: Number(query.get("bloomSpread") ?? DEFAULT_LIGHT_BLOOM.spread),
    shaftCount: Number(query.get("shaftCount") ?? DEFAULT_LIGHT_BLOOM.shaftCount),
    shaftAmount: Number(query.get("shaftAmount") ?? DEFAULT_LIGHT_BLOOM.shaftAmount),
    shaftDrift: Number(query.get("shaftDrift") ?? DEFAULT_LIGHT_BLOOM.shaftDrift),
    grain: Number(query.get("bloomGrain") ?? DEFAULT_LIGHT_BLOOM.grain),
    vignette: Number(query.get("bloomVignette") ?? DEFAULT_LIGHT_BLOOM.vignette),
  };
  const queryFrostedTypeBand: FrostedTypeBandSettings = (() => {
    try {
      return {
        ...DEFAULT_FROSTED_TYPE_BAND,
        ...JSON.parse(query.get("frostedTypeBand") ?? "{}"),
      };
    } catch {
      return DEFAULT_FROSTED_TYPE_BAND;
    }
  })();
  const queryPaperImage: PaperImageSettings = (() => {
    try {
      return { ...DEFAULT_PAPER_IMAGE, ...JSON.parse(query.get("paperImage") ?? "{}") };
    } catch {
      return DEFAULT_PAPER_IMAGE;
    }
  })();
  const queryRipple: InspiraRippleSettings = (() => {
    try {
      return { ...DEFAULT_INSPIRA_RIPPLE, ...JSON.parse(query.get("ripple") ?? "{}") };
    } catch {
      return DEFAULT_INSPIRA_RIPPLE;
    }
  })();
  const queryMaterial = (query.get("material") ?? "silver") as MaterialPresetId;
  const queryMaterialEnabled = query.get("materialEnabled") === "true";
  const queryFrontTexture = query.get("frontTexture") ?? undefined;
  const queryBackTexture = query.get("backTexture") ?? undefined;
  const queryBorderIllustration: BorderIllustration | undefined = (() => {
    try {
      const key = query.get("borderIllustrationKey");
      if (key && window.parent !== window) return window.parent.__originKitBorderIllustrations?.[key];
      return JSON.parse(query.get("borderIllustration") ?? "null") ?? undefined;
    }
    catch { return undefined; }
  })();
  const queryBorderOverlayIllustrations: BorderIllustration[] = (() => {
    try {
      const key = query.get("borderOverlayIllustrationsKey");
      if (key && window.parent !== window)
        return window.parent.__originKitBorderOverlayIllustrations?.[key] ?? [];
      return JSON.parse(query.get("borderOverlayIllustrations") ?? "[]") ?? [];
    }
    catch { return []; }
  })();
  const queryShinyGraphic: ShinyGraphic | undefined = (() => {
    try {
      const key = query.get("shinyGraphicKey");
      if (key && window.parent !== window)
        return window.parent.__originKitShinyGraphics?.[key];
      return JSON.parse(query.get("shinyGraphic") ?? "null") ?? undefined;
    } catch {
      return undefined;
    }
  })();
  const queryShinyGraphicScale = Number(query.get("shinyGraphicScale") ?? 100);
  const [componentId, setComponentId] = useState(queryComponent);
  const [exportFrameTime, setExportFrameTime] = useState(exportTime);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(querySpeed);
  const [ringSpeed, setRingSpeed] = useState(queryRingSpeed);
  const [baseColor, setBaseColor] = useState(queryBaseColor);
  const [accentColor, setAccentColor] = useState(queryAccentColor);
  const [distance, setDistance] = useState(queryDistance);
  const [count, setCount] = useState(queryCount);
  const [discProportions, setDiscProportions] = useState<number[]>(queryDiscProportions);
  const [discCurve, setDiscCurve] = useState<DiscCurveSettings>(queryDiscCurve);
  const [coinSize, setCoinSize] = useState(queryCoinSize);
  const [spread, setSpread] = useState(querySpread);
  const [borderWidth, setBorderWidth] = useState(queryBorderWidth);
  const [rounded, setRounded] = useState(queryRounded);
  const [glow, setGlow] = useState(queryGlow);
  const [neonLength, setNeonLength] = useState(queryNeonLength);
  const [neonPosition, setNeonPosition] = useState(queryNeonPosition);
  const [borderAspect, setBorderAspect] = useState(queryBorderAspect);
  const [borderIllustrations, setBorderIllustrations] = useState<Record<string, BorderIllustration | undefined>>(
    queryBorderIllustration ? { [queryComponent]: queryBorderIllustration } : {},
  );
  const [borderOverlayIllustrations, setBorderOverlayIllustrations] = useState<Record<string, BorderIllustration[]>>(
    queryBorderOverlayIllustrations.length ? { [queryComponent]: queryBorderOverlayIllustrations } : {},
  );
  const [selectedBorderOverlayIndices, setSelectedBorderOverlayIndices] = useState<Record<string, number | undefined>>({});
  const [innerRadius, setInnerRadius] = useState(queryInnerRadius);
  const [text, setText] = useState(queryText);
  const [fontSize, setFontSize] = useState(queryFontSize);
  const [fontFamily, setFontFamily] = useState(queryFontFamily);
  const [fontFace, setFontFace] = useState(queryFontFace);
  const [fontWeight, setFontWeight] = useState(queryFontWeight);
  const [shinyGraphic, setShinyGraphic] = useState<ShinyGraphic | undefined>(queryShinyGraphic);
  const [shinyContentMode, setShinyContentMode] = useState<ShinyContentMode>(queryShinyGraphic ? "graphic" : "text");
  const [shinyGraphicScale, setShinyGraphicScale] = useState(queryShinyGraphicScale);
  const [shinyGraphicError, setShinyGraphicError] = useState("");
  const [interactionTrack, setInteractionTrack] = useState<InteractionSample[]>(queryInteractionTrack);
  const [recordingInteraction, setRecordingInteraction] = useState(false);
  const [replayingInteraction, setReplayingInteraction] = useState(false);
  const [lightBloom, setLightBloom] = useState<LightBloomSettings>(queryLightBloom);
  const [frostedTypeBand, setFrostedTypeBand] =
    useState<FrostedTypeBandSettings>(queryFrostedTypeBand);
  const [paperImage, setPaperImage] = useState<PaperImageSettings>(queryPaperImage);
  const [ripple, setRipple] = useState<InspiraRippleSettings>(queryRipple);
  const interactionStartedRef = useRef(0);
  const interactionPressedRef = useRef(false);
  const lastInteractionSampleRef = useRef(-1);
  const shinyTextBeforeGraphicRef = useRef(queryText || COMPONENT_DEFAULTS["shiny-pill"].text || "SHINY PILL");
  const [width, setWidth] = useState(exportWidth);
  const [height, setHeight] = useState(exportHeight);
  const [fps, setFps] = useState(queryFps);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "1:1" | "adaptive">("adaptive");
  const [duration, setDuration] = useState(queryDuration);
  const [delay, setDelay] = useState(0);
  const [background, setBackground] = useState("transparent");
  const [loop, setLoop] = useState(true);
  const [pngCompression, setPngCompression] = useState(true);
  const [colorCorrection, setColorCorrection] = useState(false);
  const [colorTarget, setColorTarget] = useState<ColorTarget>("keynote");
  const [emissiveLift, setEmissiveLift] = useState(
    DEFAULT_COMP.calibratedLift ?? 0.5,
  );
  const [unlit, setUnlit] = useState(false);
  const [appearances, setAppearances] = useState<Record<string, SurfaceAppearance>>({
    "coin-loader": { ...DEFAULT_APPEARANCE, material: materialFromPreset("silver") },
    "disc-split": { ...DEFAULT_APPEARANCE, material: materialFromPreset("gold") },
    "gyro-loader": { ...DEFAULT_APPEARANCE, material: materialFromPreset("stainless") },
    typewriter: { ...DEFAULT_APPEARANCE, material: materialFromPreset("silver") },
    "text-ring": { ...DEFAULT_APPEARANCE, material: materialFromPreset("gold") },
    "shiny-pill": { ...DEFAULT_APPEARANCE, material: materialFromPreset("plastic") },
  });
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [exportJobs, setExportJobs] = useState<Record<BrowserExportFormat, ExportJob>>({
    mov: emptyExportJob(),
    apng: emptyExportJob(),
  });
  const [usdzJob, setUsdzJob] = useState({
    running: false,
    outputPath: "",
    summary: "",
    error: "",
  });
  const originRef = useRef(0);
  const timeAtPlayRef = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const componentControlsRef = useRef<Record<string, ComponentControls>>({
    ...COMPONENT_DEFAULTS,
  });
  const componentDefinition = getMotionComponent(componentId);
  const MotionRenderer = componentDefinition.renderer;
  const isBorderComponent = [
    "glow-border",
    "neon-border",
    "pulsating-border",
  ].includes(componentId);
  const isDiscSplit = componentId === "disc-split";
  const isGyroLoader = componentId === "gyro-loader";
  const isLightBloom = componentId === "light-bloom";
  const isFrostedTypeBand = componentId === "frosted-type-band";
  const isPaperImage = componentId === "paper-image";
  const isInspiraRipple = componentId === "inspira-ripple";
  const isShinyPill = componentId === "shiny-pill";
  const isTextEffect = ["typewriter", "text-ring", "shiny-pill"].includes(componentId);
  const isShinyGraphicMode = isShinyPill && shinyContentMode === "graphic";
  const hasShinyGraphic = isShinyGraphicMode && Boolean(shinyGraphic);
  const activeShinyGraphic = isShinyGraphicMode ? shinyGraphic : undefined;
  const borderIllustration = borderIllustrations[componentId];
  const borderPngLayers = borderOverlayIllustrations[componentId] ?? [];
  const selectedBorderOverlayIndex = selectedBorderOverlayIndices[componentId];
  const neonAdaptation = adaptNeonToAspect(borderIllustration?.aspect ?? 16 / 9);
  const componentColorDefaults = COMPONENT_DEFAULTS[componentId] ?? COMPONENT_DEFAULTS["coin-loader"];
  const supportsInteractionRecording =
    componentDefinition.triggerMode === "pointer";
  const is3DComponent = ["coin-loader", "disc-split", "gyro-loader"].includes(componentId);
  const hasMaterialAppearance = is3DComponent || isTextEffect;
  const appearance = exportMode
    ? { ...DEFAULT_APPEARANCE, enabled: queryMaterialEnabled, material: materialFromPreset(queryMaterial), frontTexture: queryFrontTexture, backTexture: queryBackTexture }
    : appearances[componentId] ?? DEFAULT_APPEARANCE;
  const updateAppearance = (update: (value: SurfaceAppearance) => SurfaceAppearance) =>
    setAppearances((current) => ({
      ...current,
      [componentId]: update(current[componentId] ?? DEFAULT_APPEARANCE),
    }));

  useEffect(() => {
    if (exportMode || !isBorderComponent) return;
    const paste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((candidate) => candidate.type === "image/png");
      const file = item?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void loadBorderPng(file, borderIllustration ? "overlay" : "background");
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [borderIllustration, componentId, exportMode, isBorderComponent]);

  useEffect(() => {
    if (exportMode || !isShinyPill) return;
    const paste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((candidate) =>
        candidate.type === "image/png" || candidate.type === "image/svg+xml",
      );
      let file = item?.getAsFile() ?? undefined;
      if (!file) {
        const svgText = event.clipboardData?.getData("image/svg+xml") || event.clipboardData?.getData("text/plain") || "";
        if (/^\s*<svg[\s>]/i.test(svgText))
          file = new File([svgText], "剪贴板.svg", { type: "image/svg+xml" });
      }
      if (!file) return;
      event.preventDefault();
      void loadShinyGraphic(file);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [exportMode, isShinyPill, shinyContentMode, shinyGraphic, text]);

  useEffect(() => {
    if (exportMode || !isBorderComponent || !borderIllustration) return;
    let live = true;
    void fetch(borderIllustration.src)
      .then((response) => response.blob())
      .then((blob) => inspectBorderIllustration(new File([blob], borderIllustration.name, { type: "image/png" })))
      .then((next) => {
        if (!live) return;
        setBorderIllustrations((current) => ({ ...current, [componentId]: next }));
        setBorderAspect(next.aspect);
        setRounded(next.rounded);
        if (componentId === "neon-border") {
          const adapted = adaptNeonToAspect(next.aspect);
          setBorderWidth(adapted.borderWidth);
          setNeonLength(adapted.neonLength);
        }
      })
      .catch(console.error);
    return () => { live = false; };
  }, [borderIllustration?.src, componentId, exportMode, isBorderComponent]);

  useEffect(() => {
    if (!exportMode) return;
    window.__originKitRenderAt = (absoluteTime: number) =>
      setExportFrameTime(absoluteTime);
    return () => {
      delete window.__originKitRenderAt;
    };
  }, [exportMode]);

  if (exportMode) {
    document.documentElement.dataset.render = "frame";
    return (
      <div
        data-testid="export-stage"
        style={{
          width: exportWidth,
          height: exportHeight,
          position: "fixed",
          inset: 0,
          background:
            queryBackground === "transparent" ? "transparent" : queryBackground,
        }}
      >
        <MotionRenderer
          baseColor={queryBaseColor}
          accentColor={queryAccentColor}
          speed={querySpeed}
          distance={queryDistance}
          coins={{
            count: queryCount,
            coinSize: queryCoinSize,
            spread: querySpread,
            ringSpeed: queryRingSpeed,
          }}
          disc={{
            count: queryCount,
            proportions: queryDiscProportions,
            curve: queryDiscCurve,
            innerRadius: queryInnerRadius,
            thickness: queryCoinSize,
            burst: querySpread,
          }}
          text={queryText}
          fontSize={queryFontSize}
          fontFamily={queryFontFamily}
          fontFace={queryFontFace}
          fontWeight={queryFontWeight}
          shinyGraphic={queryShinyGraphic}
          shinyGraphicScale={queryShinyGraphicScale}
          interactionTrack={queryInteractionTrack}
          lightBloom={queryLightBloom}
          frostedTypeBand={queryFrostedTypeBand}
          paperImage={queryPaperImage}
          ripple={queryRipple}
          timeSeconds={Number.isFinite(exportFrameTime) ? exportFrameTime : 0}
          loopDuration={queryDuration}
          background={isLightBloom || isInspiraRipple ? queryBackground : "transparent"}
          borderWidth={queryBorderWidth}
          rounded={queryRounded}
          glow={queryGlow}
          neonLength={queryNeonLength}
          neonPosition={queryNeonPosition}
          borderAspect={queryBorderAspect}
          borderIllustration={queryBorderIllustration}
          borderOverlayIllustrations={queryBorderOverlayIllustrations}
          canvasAspect={exportWidth / Math.max(1, exportHeight)}
          appearance={appearance}
        />
      </div>
    );
  }

  const frameTotal = Math.round(fps * (duration + delay));
  const rotationRate = DEFAULT_LOOP_DURATION / Math.max(0.1, duration);
  const previewTime =
    loop && duration > 0 ? time % duration : Math.min(time, duration);
  const exportPayload = useMemo(
    () => ({
      componentId,
      componentName: componentDefinition.name,
      width,
      height,
      adaptiveCanvas: aspectRatio === "adaptive",
      fps,
      duration,
      delay,
      background,
      baseColor,
      accentColor,
      speed,
      ringSpeed,
      distance,
      count,
      coinSize,
      spread,
      borderWidth,
      rounded,
      glow,
      neonLength,
      neonPosition,
      borderAspect,
      borderIllustration,
      borderOverlayIllustrations: borderPngLayers,
      innerRadius,
      discProportions,
      discCurve,
      text,
      fontSize,
      fontFamily,
      fontFace,
      fontWeight,
      shinyGraphic: activeShinyGraphic,
      shinyGraphicScale,
      interactionTrack,
      lightBloom,
      frostedTypeBand,
      paperImage,
      ripple,
      pngCompression,
      keepFrames: false,
      material: appearance.material.preset,
      materialEnabled: appearance.enabled,
      frontTexture: appearance.frontTexture,
      backTexture: appearance.backTexture,
    }),
    [
      componentId,
      componentDefinition.name,
      width,
      height,
      aspectRatio,
      fps,
      duration,
      delay,
      background,
      baseColor,
      accentColor,
      speed,
      ringSpeed,
      distance,
      count,
      coinSize,
      spread,
      borderWidth,
      rounded,
      glow,
      neonLength,
      neonPosition,
      borderAspect,
      borderIllustration,
      borderPngLayers,
      innerRadius,
      discProportions,
      discCurve,
      text,
      fontSize,
      fontFamily,
      fontFace,
      fontWeight,
      activeShinyGraphic,
      shinyGraphicScale,
      interactionTrack,
      lightBloom,
      frostedTypeBand,
      paperImage,
      ripple,
      pngCompression,
      appearance.material.preset,
      appearance.enabled,
      appearance.frontTexture,
      appearance.backTexture,
    ],
  );
  const activeColorProfile = colorProfileFor(colorTarget);
  const usdzPayload = useMemo(
    () => ({
      ...exportPayload,
      colorComp: colorCorrection ? activeColorProfile : undefined,
      emissiveLift,
      unlit,
      appearance,
    }),
    [exportPayload, colorCorrection, activeColorProfile, emissiveLift, unlit, appearance],
  );
  const colorMismatch =
    (activeColorProfile.calibratedUnlit !== null &&
      activeColorProfile.calibratedUnlit !== unlit) ||
    (activeColorProfile.calibratedLift !== null &&
      Math.abs(activeColorProfile.calibratedLift - emissiveLift) > 0.02);
  const chooseColorTarget = (target: ColorTarget) => {
    const profile = colorProfileFor(target);
    setColorTarget(target);
    setEmissiveLift(profile.calibratedLift ?? 0.5);
    setUnlit(profile.calibratedUnlit ?? false);
  };

  const chooseComponent = (nextId: string) => {
    componentControlsRef.current[componentId] = {
      baseColor,
      accentColor,
      speed,
      ringSpeed,
      distance,
      count,
      coinSize,
      spread,
      borderWidth,
      rounded,
      glow,
      neonLength,
      neonPosition,
      borderAspect,
      innerRadius,
      text,
      fontSize,
      fontFamily,
      fontFace,
      fontWeight,
      duration,
    };
    const next =
      componentControlsRef.current[nextId] ??
      COMPONENT_DEFAULTS[nextId] ??
      COMPONENT_DEFAULTS["coin-loader"];
    setComponentId(nextId);
    setBaseColor(next.baseColor);
    setAccentColor(next.accentColor);
    setSpeed(next.speed);
    setRingSpeed(next.ringSpeed);
    setDistance(next.distance);
    setCount(next.count);
    setDiscProportions(Array.from({ length: next.count }, () => 1 / next.count));
    setDiscCurve(DEFAULT_DISC_CURVE);
    setCoinSize(next.coinSize);
    setSpread(next.spread);
    setBorderWidth(next.borderWidth);
    setRounded(next.rounded);
    setGlow(next.glow);
    setNeonLength(next.neonLength ?? 50);
    setNeonPosition(next.neonPosition ?? 0);
    setBorderAspect(next.borderAspect);
    setInnerRadius(next.innerRadius);
    setText(next.text ?? "");
    setFontSize(next.fontSize ?? 80);
    setFontFamily(next.fontFamily ?? "PingFang SC");
    setFontFace(next.fontFace ?? "");
    setFontWeight(next.fontWeight ?? 400);
    setInteractionTrack([]);
    setReplayingInteraction(false);
    setDuration(next.duration);
    setTime(0);
  };

  async function startExport(format: "mov" | "apng") {
    setExportJobs((current) => ({
      ...current,
      [format]: {
        ...current[format],
        running: true,
        stage: "准备导出",
        frame: 0,
        totalFrames: frameTotal,
        progress: 0,
        outputPath: "",
        framesPath: "",
        error: "",
      },
    }));
    try {
      const result = await exportInBrowser(format, exportPayload, (progress) =>
        setExportJobs((current) => ({
          ...current,
          [format]: { ...current[format], ...progress },
        })),
      );
      setExportJobs((current) => ({
        ...current,
        [format]: {
          ...current[format],
          running: false,
          stage: `Finished · 已下载 ${result.outputName}`,
          progress: 100,
          outputPath: "",
        },
      }));
    } catch (error) {
      const cancelled =
        error instanceof DOMException && error.name === "AbortError";
      setExportJobs((current) => ({
        ...current,
        [format]: {
          ...current[format],
          running: false,
          stage: cancelled ? "已取消" : "导出失败",
          error: cancelled
            ? ""
            : error instanceof Error
              ? error.message
              : String(error),
        },
      }));
    }
  }

  async function revealOutput(path?: string) {
    await fetch("/api/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(path ? { path } : {}),
    });
  }

  async function exportUsdz() {
    if (!componentDefinition.exportCapabilities.includes("usdz")) return;
    setUsdzJob({
      running: true,
      outputPath: "",
      summary: "正在浏览器中生成动画 USDZ…",
      error: "",
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = isFrostedTypeBand
        ? await buildFrostedTypeBandUsdz(usdzPayload)
        : isDiscSplit
        ? buildDiscSplitUsdz(usdzPayload)
        : isGyroLoader
          ? buildGyroLoaderUsdz(usdzPayload)
          : buildCoinUsdz(usdzPayload);
      downloadUsdz(
        result.bytes,
        `OriginKit-${componentDefinition.name.replaceAll(" ", "-")}-${Date.now()}.usdz`,
      );
      setUsdzJob({
        running: false,
        outputPath: "",
        summary: `已下载 · 完整循环 ${duration.toFixed(3)} 秒 · ${fps} FPS · ${result.frames} 个确定性采样`,
        error: "",
      });
    } catch (error) {
      setUsdzJob({
        running: false,
        outputPath: "",
        summary: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function cancelExport(format: BrowserExportFormat) {
    cancelBrowserExport(format);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const zoom = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDistance((value) =>
        Math.min(80, Math.max(0.5, value + event.deltaY * 0.015)),
      );
    };
    preview.addEventListener("wheel", zoom, { passive: false });
    return () => preview.removeEventListener("wheel", zoom);
  }, []);

  useEffect(() => {
    if (!playing) return;
    originRef.current = performance.now();
    timeAtPlayRef.current = time;
    let raf = 0;
    const tick = (now: number) => {
      const nextTime = timeAtPlayRef.current + (now - originRef.current) / 1000;
      setTime(nextTime);
      if (!loop && nextTime >= duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, duration]);

  const boundedRotationRate = Math.min(3, Math.max(0.5, rotationRate));
  const setRatio = (ratio: "16:9" | "1:1" | "adaptive") => {
    setAspectRatio(ratio);
    setHeight(
      ratio === "1:1"
        ? width
        : ratio === "adaptive"
          ? height
          : Math.round((width * 9) / 16),
    );
  };
  const setResolution = (wide: number, tall: number) => {
    const nextWidth = aspectRatio === "1:1" ? tall : wide;
    setWidth(nextWidth);
    setHeight(
      aspectRatio === "1:1"
        ? tall
        : aspectRatio === "adaptive"
          ? tall
          : tall,
    );
  };
  const chooseMaterial = (preset: MaterialPresetId) =>
    updateAppearance((current) => ({
      ...current,
      material: materialFromPreset(preset),
    }));
  const loadTexture = (side: "frontTexture" | "backTexture", file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () =>
      updateAppearance((current) => ({
        ...current,
        [side]: typeof reader.result === "string" ? reader.result : undefined,
      }));
    reader.readAsDataURL(file);
  };
  async function loadBorderPng(file?: File, target: "background" | "overlay" = "background") {
    if (!file || file.type !== "image/png" || !isBorderComponent) return;
    try {
      const next = await inspectBorderIllustration(file);
      if (target === "overlay") {
        setBorderOverlayIllustrations((current) => ({
          ...current,
          [componentId]: [...(current[componentId] ?? []), { ...next, offsetX: 0, offsetY: 0, scale: 100 }],
        }));
        setSelectedBorderOverlayIndices((current) => ({
          ...current,
          [componentId]: borderPngLayers.length,
        }));
        return;
      }
      setBorderIllustrations((current) => ({ ...current, [componentId]: next }));
      setBorderAspect(next.aspect);
      setRounded(next.rounded);
      if (componentId === "neon-border") {
        const adapted = adaptNeonToAspect(next.aspect);
        setBorderWidth(adapted.borderWidth);
        setNeonLength(adapted.neonLength);
      }
    } catch (error) {
      console.error(error);
    }
  }
  async function loadShinyGraphic(file?: File) {
    if (!file || componentId !== "shiny-pill") return;
    setShinyGraphicError("");
    try {
      const next = await inspectShinyGraphic(file);
      if (shinyContentMode === "text") shinyTextBeforeGraphicRef.current = text;
      setShinyGraphic(next);
      setShinyContentMode("graphic");
      setShinyGraphicScale(100);
      setText("");
    } catch (error) {
      setShinyGraphicError(error instanceof Error ? error.message : String(error));
    }
  }
  const removeShinyGraphic = () => {
    setShinyGraphic(undefined);
    setShinyContentMode("text");
    setShinyGraphicScale(100);
    setShinyGraphicError("");
    setText(shinyTextBeforeGraphicRef.current);
  };
  const showShinyText = () => {
    if (shinyContentMode === "text") return;
    setShinyContentMode("text");
    setText(shinyTextBeforeGraphicRef.current);
  };
  const showShinyGraphic = () => {
    if (shinyContentMode === "graphic") return;
    shinyTextBeforeGraphicRef.current = text;
    setShinyContentMode("graphic");
    setText("");
  };
  const startInteractionRecording = () => {
    setReplayingInteraction(false);
    setInteractionTrack([]);
    interactionStartedRef.current = performance.now();
    interactionPressedRef.current = false;
    lastInteractionSampleRef.current = -1;
    setTime(0);
    setPlaying(true);
    setRecordingInteraction(true);
  };
  const stopInteractionRecording = () => {
    setRecordingInteraction(false);
    interactionPressedRef.current = false;
  };
  const replayInteraction = () => {
    setReplayingInteraction(true);
    setTime(0);
    setPlaying(true);
  };
  const recordInteraction = (
    event: React.PointerEvent<HTMLDivElement>,
    active: boolean,
    pressed = interactionPressedRef.current,
    force = false,
  ) => {
    if (!recordingInteraction) return;
    const now = performance.now();
    const relative = (now - interactionStartedRef.current) / 1000;
    if (!force && relative - lastInteractionSampleRef.current < 1 / 60) return;
    const rect = event.currentTarget.getBoundingClientRect();
    lastInteractionSampleRef.current = relative;
    setInteractionTrack((current) => [
      ...current,
      {
        time: relative,
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
        active,
        pressed,
      },
    ]);
  };
  return (
    <main className="app">
      <section className="stage">
        <header className="titlebar">
          <strong className="tool-name">前端→Keynote</strong>
          <div className="title-actions">
            <span className="version">260912X1</span>
            <button
              className="theme-toggle"
              aria-label={
                theme === "light" ? "切换到暗色外观" : "切换到亮色外观"
              }
              onClick={() =>
                setTheme((value) => (value === "light" ? "dark" : "light"))
              }
            >
              {theme === "light" ? "☀" : "☾"}
            </button>
          </div>
        </header>
        <div className="checkerboard" ref={previewRef}>
          <div
            className={`canvas-stage ${aspectRatio === "1:1" ? "square" : ""}`}
            style={{
              aspectRatio:
                aspectRatio === "1:1"
                  ? "1 / 1"
                  : aspectRatio === "adaptive"
                    ? "16 / 9"
                    : "16 / 9",
              ...(background === "transparent"
                ? {}
                : { background, backgroundImage: "none" }),
            }}
            data-testid="render-stage"
            onDragOver={(event) => {
              const acceptsBorder = isBorderComponent && Array.from(event.dataTransfer.items).some((item) => item.type === "image/png");
              const acceptsShiny = isShinyPill && Array.from(event.dataTransfer.items).some((item) => item.type === "image/png" || item.type === "image/svg+xml");
              if (!acceptsBorder && !acceptsShiny && !event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              const file = Array.from(event.dataTransfer.files).find((candidate) =>
                isShinyPill ? Boolean(shinyGraphicKind(candidate)) : candidate.type === "image/png",
              );
              if (!file) return;
              event.preventDefault();
              if (isShinyPill) void loadShinyGraphic(file);
              else if (isBorderComponent) void loadBorderPng(file, borderIllustration ? "overlay" : "background");
            }}
            onPointerEnter={(event) => recordInteraction(event, true, false, true)}
            onPointerMove={(event) => recordInteraction(event, true)}
            onPointerDown={(event) => {
              interactionPressedRef.current = true;
              recordInteraction(event, true, true, true);
            }}
            onPointerUp={(event) => {
              interactionPressedRef.current = false;
              recordInteraction(event, true, false, true);
            }}
            onPointerLeave={(event) => recordInteraction(event, false, false, true)}
          >
            <MotionRenderer
              background={isLightBloom || isInspiraRipple ? background : "transparent"}
              baseColor={baseColor}
              accentColor={accentColor}
              speed={speed}
              distance={distance}
              coins={{ count, coinSize, spread, ringSpeed }}
              disc={{ count, proportions: discProportions, curve: discCurve, innerRadius, thickness: coinSize, burst: spread }}
              text={text}
              fontSize={fontSize}
              fontFamily={fontFamily}
              fontFace={fontFace}
              fontWeight={fontWeight}
              shinyGraphic={activeShinyGraphic}
              shinyGraphicScale={shinyGraphicScale}
              interactionTrack={replayingInteraction ? interactionTrack : []}
              lightBloom={lightBloom}
              frostedTypeBand={frostedTypeBand}
              paperImage={paperImage}
              ripple={ripple}
              borderWidth={borderWidth}
              rounded={rounded}
              glow={glow}
              neonLength={neonLength}
              neonPosition={neonPosition}
              borderAspect={borderAspect}
              borderIllustration={borderIllustration}
              borderOverlayIllustrations={borderPngLayers}
              selectedBorderOverlayIndex={selectedBorderOverlayIndex}
              onBorderOverlayChange={(index, offsetX, offsetY, scale) => {
                setSelectedBorderOverlayIndices((current) => ({ ...current, [componentId]: index }));
                setBorderOverlayIllustrations((current) => ({
                  ...current,
                  [componentId]: (current[componentId] ?? []).map((value, candidate) =>
                    candidate === index ? { ...value, offsetX, offsetY, scale } : value,
                  ),
                }));
              }}
              canvasAspect={
                aspectRatio === "1:1"
                  ? 1
                  : aspectRatio === "adaptive"
                    ? 16 / 9
                    : 16 / 9
              }
              timeSeconds={previewTime}
              loopDuration={duration}
              appearance={appearance}
            />
          </div>
        </div>
        <div className="stage-dock">
          <span>{componentDefinition.name} · 双指上下滑动缩放</span>
          <div className="stage-tools">
            {supportsInteractionRecording && (
              <>
                <button
                  className={`btn ${recordingInteraction ? "recording" : ""}`}
                  onClick={recordingInteraction ? stopInteractionRecording : startInteractionRecording}
                >
                  {recordingInteraction ? "停止录制" : "录制交互"}
                </button>
                {interactionTrack.length > 0 && !recordingInteraction && (
                  <button className="btn" onClick={replayInteraction}>重放交互</button>
                )}
              </>
            )}
            <button
              className="btn"
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? "暂停" : "播放"}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPlaying(false);
                setTime(0);
              }}
            >
              回到开头
            </button>
          </div>
        </div>
      </section>
      <aside className="side">
        <div className="side-head">
          <ComponentPicker
            value={componentId}
            options={componentRegistry}
            onChange={chooseComponent}
          />
          <strong className="brand">饼饼SHOW</strong>
        </div>
        <SliderResetScope.Provider value={componentId}>
        <div className="side-body">
          {!componentDefinition.usesOwnCanvasBackground && (
            <section className="global-background-section">
              <h3 className="field-heading color-heading">背景颜色</h3>
              <div className="opts four background-options">
                <button
                  className={`opt ${background === "transparent" ? "active" : ""}`}
                  onClick={() => setBackground("transparent")}
                >
                  透明
                </button>
                <button
                  className={`opt ${background === "#000000" ? "active" : ""}`}
                  onClick={() => setBackground("#000000")}
                >
                  黑色
                </button>
                <button
                  className={`opt ${background === "#FFFFFF" ? "active" : ""}`}
                  onClick={() => setBackground("#FFFFFF")}
                >
                  白色
                </button>
                <label
                  className={`opt custom-color-option ${!["transparent", "#000000", "#FFFFFF"].includes(background) ? "active" : ""}`}
                >
                  <span>其它</span>
                  <input
                    aria-label="其它背景颜色"
                    type="color"
                    value={background === "transparent" ? "#808080" : background}
                    onChange={(event) => setBackground(event.target.value)}
                  />
                </label>
              </div>
            </section>
          )}
          <section>
            {!isPaperImage && <h3 className="field-heading color-heading">颜色</h3>}
            {isInspiraRipple && (
              <>
                <div className="opts">
                  <button className={`opt ${ripple.circleColor === "currentColor" ? "active" : ""}`} onClick={() => setRipple((value) => ({ ...value, circleColor: "currentColor" }))}>自动主题色</button>
                  <button className={`opt ${ripple.circleColor !== "currentColor" ? "active" : ""}`} onClick={() => setRipple((value) => ({ ...value, circleColor: theme === "dark" ? "#FFFFFF" : "#000000" }))}>自定颜色</button>
                </div>
                {ripple.circleColor !== "currentColor" && (
                  <label className="field color-field">
                    <span>圆环颜色</span>
                    <span className={`color-swatch ${ripple.circleColor.toUpperCase() === "#FFFFFF" ? "is-white" : ""}`} style={{ background: ripple.circleColor, color: colorCodeInk(ripple.circleColor) }}>
                      <span className="color-code">{ripple.circleColor.toUpperCase()}</span>
                      <input aria-label="圆环颜色" type="color" value={ripple.circleColor} onChange={(event) => setRipple((value) => ({ ...value, circleColor: event.target.value }))} />
                    </span>
                  </label>
                )}
              </>
            )}
            {isLightBloom && (
              <label className="field color-field light-bloom-background">
                <span>背景颜色</span>
                <span
                  className={`color-swatch ${lightBloom.background.toUpperCase() === "#FFFFFF" ? "is-white" : ""}`}
                  style={{ background: lightBloom.background, color: colorCodeInk(lightBloom.background) }}
                >
                  <span className="color-code">{lightBloom.background.toUpperCase()}</span>
                  <input
                    aria-label="背景颜色"
                    type="color"
                    value={lightBloom.background}
                    onChange={(event) => setLightBloom((value) => ({ ...value, background: event.target.value }))}
                  />
                </span>
              </label>
            )}
            {isFrostedTypeBand && (
              <div className="color-row">
                <label className="field color-field">
                  <span>文字颜色</span>
                  <span
                    className={`color-swatch ${frostedTypeBand.textColor.toUpperCase() === "#FFFFFF" ? "is-white" : ""}`}
                    style={{
                      background: frostedTypeBand.textColor,
                      color: colorCodeInk(frostedTypeBand.textColor),
                    }}
                  >
                    <span className="color-code">{frostedTypeBand.textColor.toUpperCase()}</span>
                    <input
                      aria-label="文字颜色"
                      type="color"
                      value={frostedTypeBand.textColor}
                      onChange={(event) =>
                        setFrostedTypeBand((value) => ({ ...value, textColor: event.target.value }))
                      }
                    />
                  </span>
                </label>
                <label className="field color-field">
                  <span>玻璃染色</span>
                  <span
                    className="color-swatch"
                    style={{
                      background: frostedTypeBand.tint,
                      color: colorCodeInk(frostedTypeBand.tint.slice(0, 7)),
                    }}
                  >
                    <span className="color-code">{frostedTypeBand.tint.toUpperCase()}</span>
                    <input
                      aria-label="玻璃染色"
                      type="color"
                      value={frostedTypeBand.tint.slice(0, 7)}
                      onChange={(event) =>
                        setFrostedTypeBand((value) => ({
                          ...value,
                          tint: `${event.target.value}${value.tint.slice(7) || "42"}`,
                        }))
                      }
                    />
                  </span>
                </label>
              </div>
            )}
            {!isFrostedTypeBand && !isPaperImage && !isInspiraRipple && <div className={`color-row ${isShinyGraphicMode ? "single" : ""}`}>
              {!isShinyGraphicMode && <div className="field color-field">
                <button
                  type="button"
                  className="color-field-reset"
                  aria-label="主体颜色，恢复默认值"
                  title="恢复默认值"
                  onClick={() => {
                    setBaseColor(componentColorDefaults.baseColor);
                    if (hasMaterialAppearance && appearance.enabled)
                      updateAppearance((current) => ({
                        ...current,
                        material: { ...current.material, color: componentColorDefaults.baseColor },
                      }));
                  }}
                >
                  主体颜色
                </button>
                <span
                  className={`color-swatch ${(hasMaterialAppearance && appearance.enabled ? appearance.material.color : baseColor).toUpperCase() === "#FFFFFF" ? "is-white" : ""}`}
                  style={{
                    background: hasMaterialAppearance && appearance.enabled ? appearance.material.color : baseColor,
                    color: colorCodeInk(hasMaterialAppearance && appearance.enabled ? appearance.material.color : baseColor),
                  }}
                >
                  <span className="color-code">
                    {(hasMaterialAppearance && appearance.enabled ? appearance.material.color : baseColor).toUpperCase()}
                  </span>
                  <input
                    aria-label="主体颜色"
                    type="color"
                    value={hasMaterialAppearance && appearance.enabled ? appearance.material.color : baseColor}
                    onChange={(event) => {
                      setBaseColor(event.target.value);
                      if (hasMaterialAppearance && appearance.enabled)
                        updateAppearance((current) => ({
                          ...current,
                          material: { ...current.material, color: event.target.value },
                        }));
                    }}
                  />
                </span>
              </div>}
              <div className="field color-field">
                <button
                  type="button"
                  className="color-field-reset"
                  aria-label={`${isShinyPill ? "扫光颜色" : "高光颜色"}，恢复默认值`}
                  title="恢复默认值"
                  onClick={() => setAccentColor(componentColorDefaults.accentColor)}
                >
                  {isShinyPill ? "扫光颜色" : "高光颜色"}
                </button>
                <span
                  className={`color-swatch ${accentColor.toUpperCase() === "#FFFFFF" ? "is-white" : ""}`}
                  style={{ background: accentColor, color: colorCodeInk(accentColor) }}
                >
                  <span className="color-code">{accentColor.toUpperCase()}</span>
                  <input
                    aria-label={isShinyPill ? "扫光颜色" : "高光颜色"}
                    type="color"
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                  />
                </span>
              </div>
            </div>}
            {hasMaterialAppearance && !isShinyGraphicMode && (
              <div className="appearance-panel">
                <label className="check-row material-toggle">
                  <input
                    type="checkbox"
                    checked={appearance.enabled}
                    onChange={(event) => updateAppearance((current) => ({ ...current, enabled: event.target.checked }))}
                  />
                  材质
                </label>
                {appearance.enabled && <>
                <div className="material-grid" role="group" aria-label="材质预设">
                  {(Object.keys(MATERIAL_PRESETS) as MaterialPresetId[]).map((id) => (
                    <button
                      key={id}
                      className={`material-option ${appearance.material.preset === id ? "active" : ""}`}
                      onClick={() => chooseMaterial(id)}
                    >
                      <i style={{ background: MATERIAL_PRESETS[id].color }} />
                      <span>{MATERIAL_PRESETS[id].label}</span>
                    </button>
                  ))}
                </div>
                <details className="material-advanced">
                  <summary>高级材质</summary>
                  <Slider label="金属感" value={Math.round(appearance.material.metallic * 100)} min={0} max={100} step={1} display={`${Math.round(appearance.material.metallic * 100)}%`} onChange={(value) => updateAppearance((current) => ({ ...current, material: { ...current.material, metallic: value / 100 } }))} />
                  <Slider label="粗糙度" value={Math.round(appearance.material.roughness * 100)} min={0} max={100} step={1} display={`${Math.round(appearance.material.roughness * 100)}%`} onChange={(value) => updateAppearance((current) => ({ ...current, material: { ...current.material, roughness: value / 100 } }))} />
                  <Slider label="不透明度" value={Math.round(appearance.material.opacity * 100)} min={5} max={100} step={1} display={`${Math.round(appearance.material.opacity * 100)}%`} onChange={(value) => updateAppearance((current) => ({ ...current, material: { ...current.material, opacity: value / 100 } }))} />
                </details>
                {(componentId === "coin-loader" || componentId === "disc-split") && (
                  <div className="texture-grid">
                    {(["frontTexture", "backTexture"] as const).map((side) => (
                      <label className="texture-slot" key={side}>
                        <span>{side === "frontTexture" ? "正面贴图" : "反面贴图"}</span>
                        {appearance[side] ? <img src={appearance[side]} alt="" /> : <b>+</b>}
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => loadTexture(side, event.target.files?.[0])} />
                      </label>
                    ))}
                    {(appearance.frontTexture || appearance.backTexture) && (
                      <button className="btn clear-textures" onClick={() => updateAppearance((current) => ({ ...current, frontTexture: undefined, backTexture: undefined }))}>清除贴图</button>
                    )}
                  </div>
                )}
                </>}
              </div>
            )}
            {isBorderComponent && (
              <>
                <Slider
                  label="动画速度"
                  value={speed}
                  min={componentId === "pulsating-border" ? 1 : 0}
                  max={
                    componentId === "neon-border"
                      ? 20
                      : componentId === "pulsating-border"
                        ? 10
                        : 100
                  }
                  step={1}
                  display={speed.toFixed(0)}
                  onChange={(value) => {
                    setSpeed(value);
                    const nextDuration = borderLoopDuration(componentId, value);
                    if (nextDuration !== undefined) setDuration(nextDuration);
                  }}
                />
                <Slider
                  label="尺寸比例"
                  className="aspect-slider"
                  value={borderAspect}
                  min={1 / 3}
                  max={3}
                  step={0.01}
                  display={
                    BORDER_ASPECT_SNAPS.find(
                      (snap) => Math.abs(snap.value - borderAspect) < 0.001,
                    )?.label ?? borderAspect.toFixed(2)
                  }
                  onChange={setBorderAspect}
                  snaps={BORDER_ASPECT_SNAPS}
                  snapThreshold={0.035}
                />
                <Slider
                  label="边框粗细"
                  value={borderWidth}
                  min={1}
                  max={10}
                  step={1}
                  display={`${borderWidth}px`}
                  onChange={setBorderWidth}
                  defaultValue={componentId === "neon-border" ? neonAdaptation.borderWidth : undefined}
                />
                <Slider
                  label="圆角"
                  value={rounded}
                  min={0}
                  max={100}
                  step={1}
                  display={`${rounded}%`}
                  onChange={setRounded}
                />
                <Slider
                  label="发光"
                  value={glow}
                  min={0}
                  max={100}
                  step={1}
                  display={`${glow}%`}
                  onChange={setGlow}
                />
                {componentId === "neon-border" && (
                  <>
                    <Slider
                      label="发光长度"
                      value={neonLength}
                      min={1}
                      max={100}
                      step={1}
                      display={`${neonLength}%`}
                      onChange={setNeonLength}
                      defaultValue={neonAdaptation.neonLength}
                    />
                    <Slider
                      label="起始位置"
                      value={neonPosition}
                      min={-100}
                      max={100}
                      step={1}
                      display={neonPosition === 0 ? "0" : `${neonPosition > 0 ? "+" : ""}${neonPosition}%`}
                      onChange={setNeonPosition}
                    />
                  </>
                )}
                <div className="field-section-divider" aria-hidden="true" />
                <div className="illustration-fit-block">
                  <div className="slider-head">
                    <span>背景插图</span>
                    <output>{borderIllustration ? displayIllustrationAspect(borderIllustration.aspect) : "—"}</output>
                  </div>
                  <div className="illustration-actions">
                    <label className="opt illustration-add-button">
                      <span>添加</span>
                      {borderIllustration && <span className="illustration-added-check" aria-label="已添加">✓</span>}
                      <input
                        type="file"
                        accept="image/png,.png"
                        onChange={(event) => {
                          void loadBorderPng(event.target.files?.[0], "background");
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="opt"
                      disabled={!borderIllustration}
                      onClick={() => {
                        setBorderIllustrations((current) => ({ ...current, [componentId]: undefined }));
                        if (componentId === "neon-border") {
                          const defaults = adaptNeonToAspect(16 / 9);
                          setBorderWidth(defaults.borderWidth);
                          setNeonLength(defaults.neonLength);
                        }
                      }}
                    >
                      去掉
                    </button>
                  </div>
                </div>
                <div className="illustration-fit-block illustration-overlay-block">
                  <div className="slider-head">
                    <span>PNG 插图</span>
                    <output>{borderPngLayers.length ? `${borderPngLayers.length} 层` : "—"}</output>
                  </div>
                  <div className="illustration-actions">
                    <label className="opt illustration-add-button">
                      <span>添加</span>
                      {borderPngLayers.length > 0 && <span className="illustration-added-check" aria-label="已添加">✓</span>}
                      <input
                        type="file"
                        accept="image/png,.png"
                        multiple
                        onChange={(event) => {
                          Array.from(event.target.files ?? []).forEach((file) => void loadBorderPng(file, "overlay"));
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="opt"
                      disabled={!borderPngLayers.length}
                      onClick={() => {
                        setBorderOverlayIllustrations((current) => ({
                          ...current,
                          [componentId]: (current[componentId] ?? []).slice(0, -1),
                        }));
                        setSelectedBorderOverlayIndices((current) => ({
                          ...current,
                          [componentId]: borderPngLayers.length > 1 ? borderPngLayers.length - 2 : undefined,
                        }));
                      }}
                    >
                      去掉
                    </button>
                  </div>
                </div>
              </>
            )}
            {isLightBloom && (
              <>
                <h3 className="field-heading">样式</h3>
                <div className="opts">
                  <button className={`opt ${lightBloom.variant === "bloom" ? "active" : ""}`} onClick={() => setLightBloom((value) => ({ ...value, variant: "bloom" }))}>Bloom</button>
                  <button className={`opt ${lightBloom.variant === "shafts" ? "active" : ""}`} onClick={() => setLightBloom((value) => ({ ...value, variant: "shafts" }))}>Shafts</button>
                </div>
                <h3 className="field-heading">方向</h3>
                <div className="opts four">
                  {(["bottom", "top", "left", "right"] as const).map((direction) => (
                    <button key={direction} className={`opt ${lightBloom.direction === direction ? "active" : ""}`} onClick={() => setLightBloom((value) => ({ ...value, direction }))}>
                      {{ bottom: "下", top: "上", left: "左", right: "右" }[direction]}
                    </button>
                  ))}
                </div>
                <Slider label="动画速度" value={speed} min={0} max={100} step={1} display={speed.toFixed(0)} onChange={setSpeed} />
                <Slider label="悬浮强度" value={lightBloom.hover} min={0} max={200} step={1} display={`${lightBloom.hover}%`} onChange={(hover) => setLightBloom((value) => ({ ...value, hover }))} />
                <h3 className="field-heading">光源</h3>
                <Slider label="上升高度" value={lightBloom.rise} min={0} max={100} step={1} display={`${lightBloom.rise}%`} onChange={(rise) => setLightBloom((value) => ({ ...value, rise }))} />
                <Slider label="扩散范围" value={lightBloom.spread} min={0} max={100} step={1} display={`${lightBloom.spread}%`} onChange={(spread) => setLightBloom((value) => ({ ...value, spread }))} />
                {lightBloom.variant === "shafts" && (
                  <>
                    <h3 className="field-heading">光束</h3>
                    <Slider label="数量" value={lightBloom.shaftCount} min={1} max={40} step={1} display={String(lightBloom.shaftCount)} onChange={(shaftCount) => setLightBloom((value) => ({ ...value, shaftCount }))} />
                    <Slider label="强度" value={lightBloom.shaftAmount} min={0} max={100} step={1} display={`${lightBloom.shaftAmount}%`} onChange={(shaftAmount) => setLightBloom((value) => ({ ...value, shaftAmount }))} />
                    <Slider label="漂移" value={lightBloom.shaftDrift} min={0} max={100} step={1} display={String(lightBloom.shaftDrift)} onChange={(shaftDrift) => setLightBloom((value) => ({ ...value, shaftDrift }))} />
                  </>
                )}
                <h3 className="field-heading">质感</h3>
                <Slider label="颗粒" value={lightBloom.grain} min={0} max={100} step={1} display={`${lightBloom.grain}%`} onChange={(grain) => setLightBloom((value) => ({ ...value, grain }))} />
                <Slider label="暗角" value={lightBloom.vignette} min={0} max={100} step={1} display={`${lightBloom.vignette}%`} onChange={(vignette) => setLightBloom((value) => ({ ...value, vignette }))} />
              </>
            )}
            {isInspiraRipple && (
              <>
                <Slider label="基础圆环尺寸" value={ripple.baseCircleSize} min={80} max={360} step={1} display={`${ripple.baseCircleSize}px`} onChange={(baseCircleSize) => setRipple((value) => ({ ...value, baseCircleSize }))} />
                <Slider label="基础圆环不透明度" value={ripple.baseCircleOpacity} min={0.05} max={0.8} step={0.01} display={ripple.baseCircleOpacity.toFixed(2)} onChange={(baseCircleOpacity) => setRipple((value) => ({ ...value, baseCircleOpacity }))} />
                <Slider label="圆环透明度递减比例" value={ripple.circleOpacityDowngradeRatio} min={0.01} max={0.12} step={0.01} display={ripple.circleOpacityDowngradeRatio.toFixed(2)} onChange={(circleOpacityDowngradeRatio) => setRipple((value) => ({ ...value, circleOpacityDowngradeRatio }))} />
                <Slider label="波纹速度" value={ripple.waveSpeed} min={10} max={240} step={5} display={`${ripple.waveSpeed}ms`} onChange={(waveSpeed) => setRipple((value) => ({ ...value, waveSpeed }))} />
                <Slider label="圆环间距" value={ripple.spaceBetweenCircle} min={20} max={140} step={5} display={`${ripple.spaceBetweenCircle}px`} onChange={(spaceBetweenCircle) => setRipple((value) => ({ ...value, spaceBetweenCircle }))} />
                <Slider label="圆环数量" value={ripple.numberOfCircles} min={2} max={14} step={1} display={String(ripple.numberOfCircles)} onChange={(numberOfCircles) => setRipple((value) => ({ ...value, numberOfCircles }))} />
              </>
            )}
            {isFrostedTypeBand && (
              <>
                <label className="field paper-image-url-field">
                  文字（用 | 分隔）
                  <input
                    type="text"
                    value={frostedTypeBand.items}
                    onChange={(event) =>
                      setFrostedTypeBand((value) => ({ ...value, items: event.target.value }))
                    }
                  />
                </label>
                <Slider
                  label="字号"
                  value={frostedTypeBand.fontSize}
                  min={8}
                  max={160}
                  step={1}
                  display={`${frostedTypeBand.fontSize}px`}
                  onChange={(fontSize) =>
                    setFrostedTypeBand((value) => ({ ...value, fontSize }))
                  }
                />
                <LocalFontPicker
                  value={frostedTypeBand.fontFamily}
                  faceValue={frostedTypeBand.fontFace}
                  weightValue={frostedTypeBand.fontWeight}
                  defaultValue={DEFAULT_FROSTED_TYPE_BAND.fontFamily}
                  defaultFaceValue={DEFAULT_FROSTED_TYPE_BAND.fontFace}
                  onChange={(fontFamily) =>
                    setFrostedTypeBand((value) => ({ ...value, fontFamily, fontFace: "" }))
                  }
                  onFaceChange={(fontFace) =>
                    setFrostedTypeBand((value) => ({ ...value, fontFace }))
                  }
                  onWeightChange={(fontWeight) =>
                    setFrostedTypeBand((value) => ({ ...value, fontWeight }))
                  }
                />
                <div className="opts">
                  <button
                    className={`opt ${frostedTypeBand.fontStyle === "normal" ? "active" : ""}`}
                    onClick={() => setFrostedTypeBand((value) => ({ ...value, fontStyle: "normal" }))}
                  >
                    正常
                  </button>
                  <button
                    className={`opt ${frostedTypeBand.fontStyle === "italic" ? "active" : ""}`}
                    onClick={() => setFrostedTypeBand((value) => ({ ...value, fontStyle: "italic" }))}
                  >
                    斜体
                  </button>
                </div>
                <Slider
                  label="字间距"
                  value={frostedTypeBand.letterSpacing}
                  min={-0.1}
                  max={0.5}
                  step={0.01}
                  display={`${frostedTypeBand.letterSpacing.toFixed(2)}em`}
                  onChange={(letterSpacing) =>
                    setFrostedTypeBand((value) => ({ ...value, letterSpacing }))
                  }
                />
                <h3 className="field-heading">布局</h3>
                <Slider label="距离" value={frostedTypeBand.distance} min={100} max={900} step={1} display={`${frostedTypeBand.distance}%`} onChange={(distance) => setFrostedTypeBand((value) => ({ ...value, distance }))} />
                <Slider label="倾斜" value={frostedTypeBand.tilt} min={0} max={45} step={1} display={`${frostedTypeBand.tilt}°`} onChange={(tilt) => setFrostedTypeBand((value) => ({ ...value, tilt }))} />
                <Slider label="文字间隔" value={frostedTypeBand.gap} min={0} max={400} step={1} display={`${frostedTypeBand.gap}px`} onChange={(gap) => setFrostedTypeBand((value) => ({ ...value, gap }))} />
                <Slider label="边缘淡出" value={frostedTypeBand.fade} min={0} max={49} step={1} display={`${frostedTypeBand.fade}%`} onChange={(fade) => setFrostedTypeBand((value) => ({ ...value, fade }))} />
                <h3 className="field-heading">动画</h3>
                <Slider label="速度" value={frostedTypeBand.speed} min={0} max={100} step={1} display={String(frostedTypeBand.speed)} onChange={(speed) => setFrostedTypeBand((value) => ({ ...value, speed }))} />
                <h3 className="field-heading">玻璃</h3>
                <Slider label="模糊" value={frostedTypeBand.blur} min={0} max={100} step={1} display={`${frostedTypeBand.blur}px`} onChange={(blur) => setFrostedTypeBand((value) => ({ ...value, blur }))} />
                <Slider label="折射" value={frostedTypeBand.refraction} min={0} max={100} step={1} display={`${frostedTypeBand.refraction}%`} onChange={(refraction) => setFrostedTypeBand((value) => ({ ...value, refraction }))} />
                <Slider label="颗粒" value={frostedTypeBand.grain} min={0} max={100} step={1} display={`${frostedTypeBand.grain}%`} onChange={(grain) => setFrostedTypeBand((value) => ({ ...value, grain }))} />
                <h3 className="field-heading">光标</h3>
                <Slider label="惯性衰减" value={frostedTypeBand.damping} min={1} max={100} step={1} display={`${frostedTypeBand.damping}%`} onChange={(damping) => setFrostedTypeBand((value) => ({ ...value, damping }))} />
                <Slider label="悬浮减速" value={frostedTypeBand.hover} min={0} max={200} step={1} display={`${frostedTypeBand.hover}%`} onChange={(hover) => setFrostedTypeBand((value) => ({ ...value, hover }))} />
              </>
            )}
            {isPaperImage && (
              <>
                <label className="field text-effect-field">
                  图片地址
                  <input type="text" value={paperImage.image} onChange={(event) => setPaperImage((value) => ({ ...value, image: event.target.value }))} />
                </label>
                <div className="field file-field paper-image-file-field">
                  <span>本机图片</span>
                  <label className="opt paper-image-file-button">
                    <span>选择图片</span>
                    <input type="file" accept="image/*" onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setPaperImage((value) => ({ ...value, image: typeof reader.result === "string" ? reader.result : value.image }));
                      reader.readAsDataURL(file);
                    }} />
                  </label>
                </div>
                <h3 className="field-heading">尺寸</h3>
                <Slider label="卡片宽度" value={paperImage.cardWidth} min={40} max={800} step={1} display={`${paperImage.cardWidth}px`} onChange={(cardWidth) => setPaperImage((value) => ({ ...value, cardWidth }))} />
                <Slider label="卡片高度" value={paperImage.cardHeight} min={40} max={800} step={1} display={`${paperImage.cardHeight}px`} onChange={(cardHeight) => setPaperImage((value) => ({ ...value, cardHeight }))} />
                <h3 className="field-heading">模式</h3>
                <div className="opts">
                  <button className={`opt ${paperImage.mode === "Wave" ? "active" : ""}`} onClick={() => setPaperImage((value) => ({ ...value, mode: "Wave" }))}>Wave</button>
                  <button className={`opt ${paperImage.mode === "Lift" ? "active" : ""}`} onClick={() => setPaperImage((value) => ({ ...value, mode: "Lift" }))}>Lift</button>
                </div>
                <Slider label="悬浮抬升" value={paperImage.hoverLift} min={0} max={100} step={1} display={`${paperImage.hoverLift}%`} onChange={(hoverLift) => setPaperImage((value) => ({ ...value, hoverLift }))} />
                <Slider label="静止抬升" value={paperImage.restLift} min={0} max={100} step={1} display={`${paperImage.restLift}%`} onChange={(restLift) => setPaperImage((value) => ({ ...value, restLift }))} />
                <Slider label="形变深度" value={paperImage.depth} min={0} max={100} step={1} display={`${paperImage.depth}%`} onChange={(depth) => setPaperImage((value) => ({ ...value, depth }))} />
                <Slider label="高光" value={paperImage.sheen} min={0} max={100} step={1} display={`${paperImage.sheen}%`} onChange={(sheen) => setPaperImage((value) => ({ ...value, sheen }))} />
              </>
            )}
            {isDiscSplit && (
              <>
                <Slider
                  label="动画速度"
                  value={speed}
                  min={0}
                  max={100}
                  step={1}
                  display={speed.toFixed(0)}
                  defaultValue={50}
                  onChange={(value) => {
                    setSpeed(value);
                    if (value > 0) setDuration(150 / value);
                  }}
                />
                <DiscCurveEditor value={discCurve} update={setDiscCurve} />
                <div className="field-section-divider" aria-hidden="true" />
                <Slider
                  label="圆盘分块"
                  value={count}
                  min={2}
                  max={12}
                  step={1}
                  display={String(count)}
                  defaultValue={6}
                  onChange={(value) => {
                    setCount(value);
                    setDiscProportions(Array.from({ length: value }, () => 1 / value));
                  }}
                />
                {discProportions.map((part, index) => (
                  <Slider
                    key={`disc-part-${index}`}
                    label={`第${index + 1}部分比例`}
                    value={part * 100}
                    min={0}
                    max={100}
                    step={1}
                    display={displayDiscShare(part, count)}
                    defaultValue={100 / count}
                    onChange={(value) => {
                      const next = [...discProportions];
                      next[index] = value / 100;
                      setDiscProportions(next);
                    }}
                  />
                ))}
                <div className="field-section-divider" aria-hidden="true" />
                <Slider
                  label="中心孔径"
                  value={innerRadius}
                  min={0}
                  max={90}
                  step={1}
                  display={`${innerRadius}%`}
                  defaultValue={31}
                  onChange={setInnerRadius}
                />
                <Slider
                  label="圆盘厚度"
                  value={coinSize}
                  min={10}
                  max={400}
                  step={1}
                  display={`${coinSize}%`}
                  defaultValue={90}
                  onChange={setCoinSize}
                />
                <Slider
                  label="爆开距离"
                  value={spread}
                  min={0}
                  max={300}
                  step={1}
                  display={`${spread}%`}
                  defaultValue={71}
                  onChange={setSpread}
                />
                <Slider
                  label="镜头距离"
                  value={distance}
                  min={3}
                  max={20}
                  step={0.1}
                  display={distance.toFixed(1)}
                  defaultValue={20}
                  onChange={setDistance}
                />
              </>
            )}
            {isGyroLoader && (
              <>
                <Slider
                  label="动画速度"
                  value={speed}
                  min={1}
                  max={100}
                  step={1}
                  display={speed.toFixed(0)}
                  onChange={(value) => {
                    setSpeed(value);
                    setDuration((2.45 * 50) / value);
                  }}
                />
                <Slider
                  label="圆环数量"
                  value={count}
                  min={1}
                  max={8}
                  step={1}
                  display={String(count)}
                  onChange={setCount}
                />
                <Slider
                  label="圆环粗细"
                  value={coinSize}
                  min={20}
                  max={400}
                  step={1}
                  display={`${coinSize}%`}
                  onChange={setCoinSize}
                />
                <Slider
                  label="错开时间"
                  value={spread}
                  min={0}
                  max={600}
                  step={10}
                  display={`${spread}ms`}
                  onChange={setSpread}
                />
                <Slider
                  label="末尾停留"
                  value={ringSpeed}
                  min={0}
                  max={2000}
                  step={50}
                  display={`${ringSpeed}ms`}
                  onChange={setRingSpeed}
                />
                <Slider
                  label="镜头距离"
                  value={distance}
                  min={3}
                  max={20}
                  step={0.1}
                  display={distance.toFixed(1)}
                  onChange={setDistance}
                />
              </>
            )}
            {isTextEffect && (
              <>
                {isShinyPill && <div className="shiny-content-source">
                  <div className="slider-head">
                    <span>内容来源</span>
                  </div>
                  <div className="opts">
                    <button
                      type="button"
                      className={`opt ${shinyContentMode === "text" ? "active" : ""}`}
                      onClick={showShinyText}
                    >
                      文字
                    </button>
                    <button
                      type="button"
                      className={`opt ${shinyContentMode === "graphic" ? "active" : ""}`}
                      onClick={showShinyGraphic}
                    >
                      图形
                    </button>
                  </div>
                </div>}
                {!isShinyGraphicMode && <>
                  <label className="field text-effect-field">
                    {componentId === "typewriter" ? "文字（用 | 分隔）" : "文字"}
                    <input
                      type="text"
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                    />
                  </label>
                  <Slider
                    label="字号"
                    value={fontSize}
                    min={24}
                    max={220}
                    step={1}
                    display={`${fontSize}px`}
                    onChange={setFontSize}
                  />
                  <LocalFontPicker
                    value={fontFamily}
                    faceValue={fontFace}
                    weightValue={fontWeight}
                    defaultValue={componentColorDefaults.fontFamily}
                    defaultFaceValue={componentColorDefaults.fontFace}
                    onChange={(value) => {
                      setFontFamily(value);
                      setFontFace("");
                    }}
                    onFaceChange={setFontFace}
                    onWeightChange={setFontWeight}
                  />
                </>}
                {isShinyPill && isShinyGraphicMode && <>
                  <div className="illustration-fit-block shiny-graphic-control">
                    <div className="slider-head">
                      <span>图形素材</span>
                      <output>{shinyGraphic ? displayIllustrationAspect(shinyGraphic.aspect) : "—"}</output>
                    </div>
                    <div className="illustration-actions">
                      <label className="opt illustration-add-button">
                        <span>添加</span>
                        {shinyGraphic && <span className="illustration-added-check" aria-label="已添加">✓</span>}
                        <input
                          type="file"
                          accept="image/png,image/svg+xml,.png,.svg"
                          onChange={(event) => {
                            void loadShinyGraphic(event.target.files?.[0]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="opt"
                        disabled={!shinyGraphic}
                        onClick={removeShinyGraphic}
                      >
                        去掉
                      </button>
                    </div>
                    {shinyGraphicError && <p className="field-error" role="alert">{shinyGraphicError}</p>}
                  </div>
                  {hasShinyGraphic && <Slider
                    label="图形大小"
                    value={shinyGraphicScale}
                    min={20}
                    max={130}
                    step={1}
                    display={`${shinyGraphicScale}%`}
                    onChange={setShinyGraphicScale}
                  />}
                </>}
                {isShinyPill && <Slider
                  label="扫光周期"
                  value={duration}
                  min={1}
                  max={12}
                  step={0.1}
                  display={`${duration.toFixed(1)}秒`}
                  onChange={(value) => {
                    setSpeed(value);
                    setDuration(value);
                  }}
                />}
              </>
            )}
            {componentId === "coin-loader" && (
              <>
                <Slider
                  label="硬币翻转"
                  value={speed}
                  min={0}
                  max={200}
                  step={50}
                  display={`${rotationsPerCycle(speed)} 圈 / 周期`}
                  onChange={setSpeed}
                />
                <Slider
                  label="圆环旋转"
                  value={ringSpeed}
                  min={0}
                  max={100}
                  step={50}
                  display={`${rotationsPerCycle(ringSpeed)} 圈 / 周期`}
                  onChange={setRingSpeed}
                />
                <Slider
                  label="整体旋转速度"
                  value={boundedRotationRate}
                  min={0.5}
                  max={3}
                  step={0.01}
                  display={`${boundedRotationRate.toFixed(2)}×`}
                  onChange={(value) =>
                    setDuration(DEFAULT_LOOP_DURATION / value)
                  }
                  snaps={[
                    { value: 0.5, label: ".5×" },
                    { value: 1, label: "1×" },
                    { value: 1.5, label: "1.5×" },
                    { value: 2, label: "2×" },
                    { value: 2.5, label: "2.5×" },
                    { value: 3, label: "3×" },
                  ]}
                />
                <Slider
                  label="硬币数量"
                  value={count}
                  min={1}
                  max={16}
                  display={String(count)}
                  onChange={setCount}
                />
                <Slider
                  label="硬币大小"
                  value={coinSize}
                  min={20}
                  max={180}
                  display={`${coinSize}%`}
                  onChange={setCoinSize}
                />
                <Slider
                  label="圆环范围"
                  value={spread}
                  min={30}
                  max={180}
                  display={`${spread}%`}
                  onChange={setSpread}
                />
                <Slider
                  label="镜头距离"
                  value={distance}
                  min={0.5}
                  max={80}
                  step={0.1}
                  display={distance.toFixed(1)}
                  onChange={setDistance}
                />
              </>
            )}
          </section>
          <section className="time-controls">
            <Slider
              label="绝对时间"
              value={previewTime}
              min={0}
              max={duration}
              step={0.001}
              display={`${previewTime.toFixed(3)} 秒`}
              onChange={(value) => {
                setPlaying(false);
                setTime(value);
              }}
            />
            <label className="check-row">
              <input
                type="checkbox"
                checked={loop}
                onChange={(event) => setLoop(event.target.checked)}
              />
              循环预览
            </label>
          </section>
          <section className="export-params">
            <h2>导出参数</h2>
            <div className="opts">
              <button
                className={`opt ${aspectRatio === "16:9" ? "active" : ""}`}
                onClick={() => setRatio("16:9")}
              >
                16:9
              </button>
              <button
                className={`opt ${aspectRatio === "1:1" ? "active" : ""}`}
                onClick={() => setRatio("1:1")}
              >
                1:1
              </button>
              <button
                className={`opt ${aspectRatio === "adaptive" ? "active" : ""}`}
                onClick={() => setRatio("adaptive")}
              >
                自适应
              </button>
            </div>
            <div className="opts four">
              <button
                className={`opt ${width === (aspectRatio === "1:1" ? 720 : 1280) ? "active" : ""}`}
                onClick={() => setResolution(1280, 720)}
              >
                720P
              </button>
              <button
                className={`opt ${width === (aspectRatio === "1:1" ? 1080 : 1920) ? "active" : ""}`}
                onClick={() => setResolution(1920, 1080)}
              >
                1080P
              </button>
              <button
                className={`opt ${width === (aspectRatio === "1:1" ? 1440 : 2560) ? "active" : ""}`}
                onClick={() => setResolution(2560, 1440)}
              >
                2K
              </button>
              <button
                className={`opt ${width === (aspectRatio === "1:1" ? 2160 : 3840) ? "active" : ""}`}
                onClick={() => setResolution(3840, 2160)}
              >
                4K
              </button>
            </div>
            <div className="field-row">
              <label className="field">
                宽度
                <input
                  type="number"
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                />
              </label>
              <label className="field">
                高度
                <input
                  type="number"
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="opts">
              <button
                className={`opt ${fps === 30 ? "active" : ""}`}
                onClick={() => setFps(30)}
              >
                30 FPS
              </button>
              <button
                className={`opt ${fps === 60 ? "active" : ""}`}
                onClick={() => setFps(60)}
              >
                60 FPS
              </button>
            </div>
            <div className="field-row">
              <label className="field">
                完整周期
                <input
                  type="number"
                  min="0.1"
                  step="0.01"
                  value={Number(duration.toFixed(3))}
                  onChange={(event) => setDuration(Number(event.target.value))}
                />
              </label>
              <label className="field">
                开始延迟
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={delay}
                  onChange={(event) => setDelay(Number(event.target.value))}
                />
              </label>
            </div>
          </section>
          <section className="export-block">
            <label className="check-row export-compression">
              <input
                type="checkbox"
                checked={pngCompression}
                onChange={(event) => setPngCompression(event.target.checked)}
              />
              无损压缩 PNG 帧（MOV 与 PNG 动图）
            </label>
            <button
              className="btn-primary mov"
              disabled={exportJobs.mov.running}
              onClick={() => startExport("mov")}
            >
              {exportJobs.mov.running ? "正在导出 MOV…" : "导出透明 MOV"}
            </button>
            <button
              className="btn-primary apng"
              disabled={exportJobs.apng.running}
              onClick={() => startExport("apng")}
            >
              {exportJobs.apng.running ? "正在导出 PNG 动图…" : "导出 PNG 动图"}
            </button>
            {(["mov", "apng"] as const).map((format) => {
              const exportJob = exportJobs[format];
              const formatName = format === "mov" ? "MOV" : "PNG 动图";
              return (
                <div key={format}>
                  {exportJob.running && (
                    <>
                      <button className="btn cancel" onClick={() => cancelExport(format)}>
                        取消{formatName}导出
                      </button>
                      <div className="progress">
                        <span style={{ width: `${exportJob.progress}%` }} />
                      </div>
                      <p className="status">
                        {formatName} · {exportJob.stage}
                        {exportJob.totalFrames > 0
                          ? ` · ${exportJob.frame} / ${exportJob.totalFrames} · ${Math.round(exportJob.progress)}%`
                          : ""}
                      </p>
                    </>
                  )}
                  {exportJob.error && <p className="error">{formatName} · {exportJob.error}</p>}
                  {exportJob.outputPath && (
                    <>
                      <p className="path">{exportJob.outputPath}</p>
                      <button className="btn" onClick={() => revealOutput()}>
                        在 Finder 中显示
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            <div className="format-divider">
              <span>苹果原生3D格式</span>
            </div>
            {componentDefinition.exportCapabilities.includes("usdz") && (
              <div className="color-correction">
                <label className="check-row color-switch">
                  <input
                    type="checkbox"
                    checked={colorCorrection}
                    onChange={(event) =>
                      setColorCorrection(event.target.checked)
                    }
                  />
                  <span>偏色抵消</span>
                </label>
                {colorCorrection && (
                  <>
                    <div
                      className="opts"
                      role="group"
                      aria-label="导出给哪个 App 使用"
                    >
                      <button
                        className={`opt ${colorTarget === "keynote" ? "active" : ""}`}
                        aria-pressed={colorTarget === "keynote"}
                        onClick={() => chooseColorTarget("keynote")}
                      >
                        Keynote
                      </button>
                      <button
                        className={`opt ${colorTarget === "freeform" ? "active" : ""}`}
                        aria-pressed={colorTarget === "freeform"}
                        onClick={() => chooseColorTarget("freeform")}
                      >
                        无边记
                      </button>
                    </div>
                    <details className="color-tweaks">
                      <summary>重新校准（一般不用）</summary>
                      <Slider
                        label="补光（换取更亮的颜色上限）"
                        value={Math.round(emissiveLift * 100)}
                        min={0}
                        max={100}
                        step={5}
                        display={`${Math.round(emissiveLift * 100)}%`}
                        onChange={(value) => setEmissiveLift(value / 100)}
                      />
                      <p className="color-hint">
                        补光会用同一份颜色同时写入自发光，提高亮色上限；加得越多，立体明暗会越平。改动后需要重新校准。
                      </p>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={unlit}
                          onChange={(event) => setUnlit(event.target.checked)}
                        />
                        <span>完全关掉灯光（补光拉满）</span>
                      </label>
                      {colorMismatch && (
                        <p className="color-warning">
                          当前内置校准是在补光{" "}
                          {Math.round(
                            (activeColorProfile.calibratedLift ?? 0) * 100,
                          )}
                          %、灯光
                          {activeColorProfile.calibratedUnlit ? "关着" : "开着"}
                          时测得；当前设置不同，颜色会偏。
                        </p>
                      )}
                      <p className="color-hint">
                        当前：{activeColorProfile.calibratedAt ?? "无校准"}
                        。这是与三棱柱项目同步的 117 格实测校准档。
                      </p>
                      <button
                        className="btn reset-profile"
                        onClick={() => {
                          setEmissiveLift(activeColorProfile.calibratedLift ?? 0.5);
                          setUnlit(activeColorProfile.calibratedUnlit ?? false);
                        }}
                      >
                        恢复内置校准
                      </button>
                    </details>
                  </>
                )}
              </div>
            )}
            <button
              className="btn-primary"
              title={
                componentDefinition.exportCapabilities.includes("usdz")
                  ? ""
                  : "该网页特效无法转换为真实 3D 几何"
              }
              disabled={
                exportJobs.mov.running ||
                exportJobs.apng.running ||
                usdzJob.running ||
                !componentDefinition.exportCapabilities.includes("usdz")
              }
              onClick={exportUsdz}
            >
              {usdzJob.running
                ? "正在生成 USDZ…"
                : componentDefinition.exportCapabilities.includes("usdz")
                  ? "导出动画 USDZ"
                  : "该组件不支持 USDZ"}
            </button>
            {usdzJob.summary && <p className="status">{usdzJob.summary}</p>}
            {usdzJob.error && <p className="error">{usdzJob.error}</p>}
            {usdzJob.outputPath && (
              <>
                <p className="path">{usdzJob.outputPath}</p>
                <button
                  className="btn"
                  onClick={() => revealOutput(usdzJob.outputPath)}
                >
                  在 Finder 中显示 USDZ
                </button>
              </>
            )}
          </section>
        </div>
        </SliderResetScope.Provider>
      </aside>
    </main>
  );
}
