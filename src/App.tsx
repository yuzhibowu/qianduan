import { useEffect, useMemo, useRef, useState } from "react";
import Slider from "./components/Slider";
import { DEFAULT_LOOP_DURATION, rotationsPerCycle } from "./time";
import { buildCoinUsdz, downloadUsdz } from "./usdz";
import { DEFAULT_COMP, FREEFORM_COMP, type ColorComp } from "./lib/color";
import { componentRegistry, getMotionComponent } from "./component-registry";
import { cancelBrowserExport, exportInBrowser } from "./browser-export";

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
    duration: DEFAULT_LOOP_DURATION,
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
    duration: BORDER_DEFAULT_DURATIONS["pulsating-border"],
  },
};
const colorProfileFor = (target: ColorTarget): ColorComp =>
  target === "keynote" ? DEFAULT_COMP : FREEFORM_COMP;
const colorTargetLabel = (target: ColorTarget) =>
  target === "keynote" ? "Keynote" : "无边记";

export default function App() {
  const query = new URLSearchParams(window.location.search);
  const exportMode = query.get("render") === "frame";
  const exportTime = Number(query.get("time") ?? 0);
  const exportWidth = Number(query.get("width") ?? 1920);
  const exportHeight = Number(query.get("height") ?? 1080);
  const queryBaseColor = query.get("baseColor") ?? "#FFFFFF";
  const queryAccentColor = query.get("accentColor") ?? "#FFFFFF";
  const querySpeed = Number(query.get("speed") ?? 100);
  const queryRingSpeed = Number(query.get("ringSpeed") ?? 50);
  const queryDistance = Number(query.get("distance") ?? 20);
  const queryCount = Number(query.get("count") ?? 8);
  const queryCoinSize = Number(query.get("coinSize") ?? 100);
  const querySpread = Number(query.get("spread") ?? 100);
  const queryBackground = query.get("background") ?? "transparent";
  const queryDuration = Number(query.get("duration") ?? DEFAULT_LOOP_DURATION);
  const queryFps = Number(query.get("fps") ?? 30);
  const queryComponent = query.get("component") ?? "coin-loader";
  const queryBorderWidth = Number(query.get("borderWidth") ?? 5);
  const queryRounded = Number(query.get("rounded") ?? 35);
  const queryGlow = Number(query.get("glow") ?? 50);
  const queryBorderAspect = Number(query.get("borderAspect") ?? 16 / 9);
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
  const [width, setWidth] = useState(exportWidth);
  const [height, setHeight] = useState(exportHeight);
  const [fps, setFps] = useState(queryFps);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "1:1">("16:9");
  const [duration, setDuration] = useState(
    query.get("duration")
      ? queryDuration
      : queryComponent === "coin-loader"
        ? DEFAULT_LOOP_DURATION
        : (BORDER_DEFAULT_DURATIONS[queryComponent] ?? 10),
  );
  const [delay, setDelay] = useState(0);
  const [background, setBackground] = useState("transparent");
  const [loop, setLoop] = useState(true);
  const [keepFrames, setKeepFrames] = useState(false);
  const [pngCompression, setPngCompression] = useState(true);
  const [colorCorrection, setColorCorrection] = useState(false);
  const [colorTarget, setColorTarget] = useState<ColorTarget>("keynote");
  const [emissiveLift, setEmissiveLift] = useState(
    DEFAULT_COMP.calibratedLift ?? 0.5,
  );
  const [unlit, setUnlit] = useState(false);
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
          timeSeconds={Number.isFinite(exportFrameTime) ? exportFrameTime : 0}
          loopDuration={queryDuration}
          background="transparent"
          borderWidth={queryBorderWidth}
          rounded={queryRounded}
          glow={queryGlow}
          borderAspect={queryBorderAspect}
          canvasAspect={exportWidth / Math.max(1, exportHeight)}
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
      keepFrames,
      pngCompression,
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
      keepFrames,
      pngCompression,
    ],
  );
  const activeColorProfile = colorProfileFor(colorTarget);
  const usdzPayload = useMemo(
    () => ({
      ...exportPayload,
      colorComp: colorCorrection ? activeColorProfile : undefined,
      emissiveLift,
      unlit,
    }),
    [exportPayload, colorCorrection, activeColorProfile, emissiveLift, unlit],
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
      const result = buildCoinUsdz(usdzPayload);
      downloadUsdz(result.bytes, `OriginKit-Coin-Loader-${Date.now()}.usdz`);
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
  return (
    <main className="app">
      <section className="stage">
        <header className="titlebar">
          <strong className="tool-name">
            OriginKit → Keynote Motion Exporter
          </strong>
          <div className="title-actions">
            <span className="version">260909X9</span>
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
          >
            <MotionRenderer
              background="transparent"
              baseColor={baseColor}
              accentColor={accentColor}
              speed={speed}
              distance={distance}
              coins={{ count, coinSize, spread, ringSpeed }}
              borderWidth={borderWidth}
              rounded={rounded}
              glow={glow}
              borderAspect={borderAspect}
              canvasAspect={aspectRatio === "1:1" ? 1 : 16 / 9}
              timeSeconds={previewTime}
              loopDuration={duration}
            />
          </div>
        </div>
        <div className="stage-dock">
          <span>{componentDefinition.name} · 双指上下滑动缩放</span>
          <div className="stage-tools">
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
          <select
            className="model-type"
            aria-label="组件"
            value={componentId}
            onChange={(event) => chooseComponent(event.target.value)}
          >
            {componentRegistry.map((component) => (
              <option key={component.id} value={component.id}>
                {component.name}
              </option>
            ))}
          </select>
          <strong className="brand">饼饼SHOW</strong>
        </div>
        <div className="side-body">
          <section>
            <h2>组件参数</h2>
            <div className="color-row">
              <label className="field">
                主体颜色
                <input
                  aria-label="主体颜色"
                  type="color"
                  value={baseColor}
                  onChange={(event) => setBaseColor(event.target.value)}
                />
              </label>
              <label className="field">
                高光颜色
                <input
                  aria-label="高光颜色"
                  type="color"
                  value={accentColor}
                  onChange={(event) => setAccentColor(event.target.value)}
                />
              </label>
            </div>
            {componentId !== "coin-loader" && (
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
          <section>
            <h2>时间验证</h2>
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
          <section>
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
            <div className="opts four">
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
              <input
                aria-label="背景颜色"
                type="color"
                value={background === "transparent" ? "#4A90E2" : background}
                onChange={(event) => setBackground(event.target.value)}
              />
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={keepFrames}
                onChange={(event) => setKeepFrames(event.target.checked)}
              />
              保留透明 PNG 序列
            </label>
          </section>
          <section className="export-block">
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
            <label className="check-row">
              <input
                type="checkbox"
                checked={pngCompression}
                onChange={(event) => setPngCompression(event.target.checked)}
              />
              无损压缩 PNG 动图
            </label>
            {job.running && (
              <button className="btn cancel" onClick={cancelExport}>
                取消导出
              </button>
            )}
            <div className="progress">
              <span style={{ width: `${job.progress}%` }} />
            </div>
            <p className="status">
              {job.stage}
              {job.totalFrames > 0
                ? ` · ${job.frame} / ${job.totalFrames} · ${Math.round(job.progress)}%`
                : ""}
            </p>
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
              <span>Keynote 原生 3D</span>
            </div>
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
            {componentDefinition.exportCapabilities.includes("usdz") && (
              <div className="color-correction">
                <div
                  className="opts"
                  role="group"
                  aria-label="导出给哪个 App 使用"
                >
                  <button
                    className={`opt ${colorCorrection && colorTarget === "keynote" ? "active" : ""}`}
                    aria-pressed={colorCorrection && colorTarget === "keynote"}
                    onClick={() => chooseColorTarget("keynote")}
                  >
                    Keynote
                  </button>
                  <button
                    className={`opt ${colorCorrection && colorTarget === "freeform" ? "active" : ""}`}
                    aria-pressed={colorCorrection && colorTarget === "freeform"}
                    onClick={() => chooseColorTarget("freeform")}
                  >
                    无边记
                  </button>
                </div>
                <label className="check-row color-switch">
                  <input
                    type="checkbox"
                    checked={colorCorrection}
                    onChange={(event) =>
                      setColorCorrection(event.target.checked)
                    }
                  />
                  <span>{colorTargetLabel(colorTarget)} 偏色抵消</span>
                </label>
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
              </div>
            )}
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
