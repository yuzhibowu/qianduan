import { useEffect, useMemo, useRef, useState } from "react";
import Slider from "./components/Slider";
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
import { cancelBrowserExport, exportInBrowser } from "./browser-export";
import ComponentPicker from "./components/ComponentPicker";
import LocalFontPicker from "./components/LocalFontPicker";
import type { InteractionSample } from "./interaction";
import { DEFAULT_LIGHT_BLOOM, type LightBloomSettings } from "./components/LightBloom";
import {
  DEFAULT_FROSTED_TYPE_BAND,
  type FrostedTypeBandSettings,
} from "./components/FrostedTypeBandRenderer";
import { DEFAULT_PAPER_IMAGE, PAPER_IMAGE_LOOP_DURATION, type PaperImageSettings } from "./components/PaperImageRenderer";
import {
  DEFAULT_APPEARANCE,
  MATERIAL_PRESETS,
  materialFromPreset,
  type MaterialPresetId,
  type SurfaceAppearance,
} from "./appearance";

type ColorTarget = "keynote" | "freeform";
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
  borderAspect: number;
  innerRadius: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
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
  "neon-border": 9.474,
  "pulsating-border": 10,
};

function colorCodeInk(hex: string) {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 155 ? "#000" : "#fff";
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
    duration: 19.635,
  },
  "paper-image": {
    baseColor: "#FFFFFF", accentColor: "#FFFFFF", speed: 100, ringSpeed: 50,
    distance: 20, count: 1, coinSize: 100, spread: 100, borderWidth: 5,
    rounded: 0, glow: 0, borderAspect: 340 / 440, innerRadius: 0, duration: PAPER_IMAGE_LOOP_DURATION,
  },
};
const colorProfileFor = (target: ColorTarget): ColorComp =>
  target === "keynote" ? DEFAULT_COMP : FREEFORM_COMP;

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const exportMode = query.get("render") === "frame";
  const exportTime = Number(query.get("time") ?? 0);
  const exportWidth = Number(query.get("width") ?? 1920);
  const exportHeight = Number(query.get("height") ?? 1080);
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
  const queryCoinSize = Number(query.get("coinSize") ?? queryDefaults.coinSize);
  const querySpread = Number(query.get("spread") ?? queryDefaults.spread);
  const queryBackground = query.get("background") ?? "transparent";
  const queryDuration = Number(query.get("duration") ?? queryDefaults.duration);
  const queryFps = Number(query.get("fps") ?? 30);
  const queryBorderWidth = Number(query.get("borderWidth") ?? 5);
  const queryRounded = Number(query.get("rounded") ?? 35);
  const queryGlow = Number(query.get("glow") ?? 50);
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
  const queryMaterial = (query.get("material") ?? "silver") as MaterialPresetId;
  const queryMaterialEnabled = query.get("materialEnabled") === "true";
  const queryFrontTexture = query.get("frontTexture") ?? undefined;
  const queryBackTexture = query.get("backTexture") ?? undefined;
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
  const [coinSize, setCoinSize] = useState(queryCoinSize);
  const [spread, setSpread] = useState(querySpread);
  const [borderWidth, setBorderWidth] = useState(queryBorderWidth);
  const [rounded, setRounded] = useState(queryRounded);
  const [glow, setGlow] = useState(queryGlow);
  const [borderAspect, setBorderAspect] = useState(queryBorderAspect);
  const [innerRadius, setInnerRadius] = useState(queryInnerRadius);
  const [text, setText] = useState(queryText);
  const [fontSize, setFontSize] = useState(queryFontSize);
  const [fontFamily, setFontFamily] = useState(queryFontFamily);
  const [interactionTrack, setInteractionTrack] = useState<InteractionSample[]>(queryInteractionTrack);
  const [recordingInteraction, setRecordingInteraction] = useState(false);
  const [replayingInteraction, setReplayingInteraction] = useState(false);
  const [lightBloom, setLightBloom] = useState<LightBloomSettings>(queryLightBloom);
  const [frostedTypeBand, setFrostedTypeBand] =
    useState<FrostedTypeBandSettings>(queryFrostedTypeBand);
  const [paperImage, setPaperImage] = useState<PaperImageSettings>(queryPaperImage);
  const interactionStartedRef = useRef(0);
  const interactionPressedRef = useRef(false);
  const lastInteractionSampleRef = useRef(-1);
  const [width, setWidth] = useState(exportWidth);
  const [height, setHeight] = useState(exportHeight);
  const [fps, setFps] = useState(queryFps);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "1:1">("16:9");
  const [duration, setDuration] = useState(queryDuration);
  const [delay, setDelay] = useState(0);
  const [background, setBackground] = useState("transparent");
  const [loop, setLoop] = useState(true);
  const [pngCompression, setPngCompression] = useState(false);
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
  const [job, setJob] = useState({
    running: false,
    stage: "准备就绪",
    frame: 0,
    totalFrames: 0,
    progress: 0,
    outputPath: "",
    framesPath: "",
    error: "",
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
  const isTextEffect = ["typewriter", "text-ring", "shiny-pill"].includes(componentId);
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
            innerRadius: queryInnerRadius,
            thickness: queryCoinSize,
            burst: querySpread,
          }}
          text={queryText}
          fontSize={queryFontSize}
          fontFamily={queryFontFamily}
          interactionTrack={queryInteractionTrack}
          lightBloom={queryLightBloom}
          frostedTypeBand={queryFrostedTypeBand}
          paperImage={queryPaperImage}
          timeSeconds={Number.isFinite(exportFrameTime) ? exportFrameTime : 0}
          loopDuration={queryDuration}
          background={isLightBloom ? queryBackground : "transparent"}
          borderWidth={queryBorderWidth}
          rounded={queryRounded}
          glow={queryGlow}
          borderAspect={queryBorderAspect}
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
      borderAspect,
      innerRadius,
      text,
      fontSize,
      fontFamily,
      interactionTrack,
      lightBloom,
      frostedTypeBand,
      paperImage,
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
      borderAspect,
      innerRadius,
      text,
      fontSize,
      fontFamily,
      interactionTrack,
      lightBloom,
      frostedTypeBand,
      paperImage,
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
      borderAspect,
      innerRadius,
      text,
      fontSize,
      fontFamily,
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
    setCoinSize(next.coinSize);
    setSpread(next.spread);
    setBorderWidth(next.borderWidth);
    setRounded(next.rounded);
    setGlow(next.glow);
    setBorderAspect(next.borderAspect);
    setInnerRadius(next.innerRadius);
    setText(next.text ?? "");
    setFontSize(next.fontSize ?? 80);
    setFontFamily(next.fontFamily ?? "PingFang SC");
    setInteractionTrack([]);
    setReplayingInteraction(false);
    setDuration(next.duration);
    setTime(0);
  };

  async function startExport(format: "mov" | "apng") {
    setJob((current) => ({
      ...current,
      running: true,
      stage: "准备导出",
      frame: 0,
      totalFrames: frameTotal,
      progress: 0,
      outputPath: "",
      framesPath: "",
      error: "",
    }));
    try {
      const result = await exportInBrowser(format, exportPayload, (progress) =>
        setJob((current) => ({ ...current, ...progress })),
      );
      setJob((current) => ({
        ...current,
        running: false,
        stage: `Finished · 已下载 ${result.outputName}`,
        progress: 100,
        outputPath: "",
      }));
    } catch (error) {
      const cancelled =
        error instanceof DOMException && error.name === "AbortError";
      setJob((current) => ({
        ...current,
        running: false,
        stage: cancelled ? "已取消" : "导出失败",
        error: cancelled
          ? ""
          : error instanceof Error
            ? error.message
            : String(error),
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

  async function cancelExport() {
    cancelBrowserExport();
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
  const setRatio = (ratio: "16:9" | "1:1") => {
    setAspectRatio(ratio);
    setHeight(ratio === "1:1" ? width : Math.round((width * 9) / 16));
  };
  const setResolution = (wide: number, tall: number) => {
    setWidth(aspectRatio === "1:1" ? tall : wide);
    setHeight(tall);
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
            <span className="version">260910X17</span>
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
              aspectRatio: aspectRatio === "1:1" ? "1 / 1" : "16 / 9",
              ...(background === "transparent"
                ? {}
                : { background, backgroundImage: "none" }),
            }}
            data-testid="render-stage"
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
              background={isLightBloom ? background : "transparent"}
              baseColor={baseColor}
              accentColor={accentColor}
              speed={speed}
              distance={distance}
              coins={{ count, coinSize, spread, ringSpeed }}
              disc={{ count, innerRadius, thickness: coinSize, burst: spread }}
              text={text}
              fontSize={fontSize}
              fontFamily={fontFamily}
              interactionTrack={replayingInteraction ? interactionTrack : []}
              lightBloom={lightBloom}
              frostedTypeBand={frostedTypeBand}
              paperImage={paperImage}
              borderWidth={borderWidth}
              rounded={rounded}
              glow={glow}
              borderAspect={borderAspect}
              canvasAspect={aspectRatio === "1:1" ? 1 : 16 / 9}
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
        <div className="side-body">
          {componentDefinition.category !== "Background" && (
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
            {!isFrostedTypeBand && !isPaperImage && <div className="color-row">
              <label className="field color-field">
                <span>主体颜色</span>
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
              </label>
              <label className="field color-field">
                <span>高光颜色</span>
                <span
                  className={`color-swatch ${accentColor.toUpperCase() === "#FFFFFF" ? "is-white" : ""}`}
                  style={{ background: accentColor, color: colorCodeInk(accentColor) }}
                >
                  <span className="color-code">{accentColor.toUpperCase()}</span>
                  <input
                    aria-label="高光颜色"
                    type="color"
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                  />
                </span>
              </label>
            </div>}
            {hasMaterialAppearance && (
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
                  onChange={setSpeed}
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
                  onChange={(fontFamily) =>
                    setFrostedTypeBand((value) => ({ ...value, fontFamily }))
                  }
                />
                <Slider
                  label="字重"
                  value={frostedTypeBand.fontWeight}
                  min={100}
                  max={900}
                  step={100}
                  display={String(frostedTypeBand.fontWeight)}
                  onChange={(fontWeight) =>
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
                  onChange={(value) => {
                    setSpeed(value);
                    if (value > 0) setDuration(150 / value);
                  }}
                />
                <Slider
                  label="圆盘分块"
                  value={count}
                  min={2}
                  max={12}
                  step={1}
                  display={String(count)}
                  onChange={setCount}
                />
                <Slider
                  label="中心孔径"
                  value={innerRadius}
                  min={0}
                  max={90}
                  step={1}
                  display={`${innerRadius}%`}
                  onChange={setInnerRadius}
                />
                <Slider
                  label="圆盘厚度"
                  value={coinSize}
                  min={10}
                  max={400}
                  step={1}
                  display={`${coinSize}%`}
                  onChange={setCoinSize}
                />
                <Slider
                  label="爆开距离"
                  value={spread}
                  min={0}
                  max={300}
                  step={1}
                  display={`${spread}%`}
                  onChange={setSpread}
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
                <LocalFontPicker value={fontFamily} onChange={setFontFamily} />
                {componentId === "shiny-pill" && (
                  <Slider
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
                  />
                )}
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
              disabled={job.running}
              onClick={() => startExport("mov")}
            >
              {job.running ? "正在导出…" : "导出透明 MOV"}
            </button>
            <button
              className="btn-primary apng"
              disabled={job.running}
              onClick={() => startExport("apng")}
            >
              {job.running ? "正在导出…" : "导出 PNG 动图"}
            </button>
            {job.running && (
              <button className="btn cancel" onClick={cancelExport}>
                取消导出
              </button>
            )}
            {job.running && (
              <>
                <div className="progress">
                  <span style={{ width: `${job.progress}%` }} />
                </div>
                <p className="status">
                  {job.stage}
                  {job.totalFrames > 0
                    ? ` · ${job.frame} / ${job.totalFrames} · ${Math.round(job.progress)}%`
                    : ""}
                </p>
              </>
            )}
            {job.error && <p className="error">{job.error}</p>}
            {job.outputPath && (
              <>
                <p className="path">{job.outputPath}</p>
                <button className="btn" onClick={() => revealOutput()}>
                  在 Finder 中显示
                </button>
              </>
            )}
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
                job.running ||
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
      </aside>
    </main>
  );
}
