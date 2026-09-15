import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { zipSync } from "fflate";
import type { InteractionSample } from "./interaction";
import type { LightBloomSettings } from "./components/LightBloom";
import type { FrostedTypeBandSettings } from "./components/FrostedTypeBandRenderer";
import type { PaperImageSettings } from "./components/PaperImageRenderer";
import type { InspiraRippleSettings } from "./components/InspiraRipple";
import type { DiscCurveSettings } from "./disc-curve";
import type { BorderIllustration } from "./border-illustration";
import type { BorderWrapPosition } from "./alpha-edge-mask";
import type { ShinyGraphic } from "./shiny-graphic";
import { FullFrameApngBuilder } from "./apng";
import {
  ADAPTIVE_SAFETY_PADDING,
  adaptiveAlphaBounds,
  staticBorderAdaptiveCrop,
  type PixelBounds,
} from "./adaptive-bounds";
import {
  appendNativeFrame,
  cancelNativeExport,
  detectNativeExporter,
  downloadNativeExport,
  finishNativeExport,
  startNativeExport,
  type NativeExportSession,
} from "./native-export";

export type BrowserExportFormat = "mov" | "apng";

export type BrowserExportSettings = {
  componentId: string;
  componentName: string;
  width: number;
  height: number;
  adaptiveCanvas?: boolean;
  fps: number;
  duration: number;
  delay: number;
  background: string;
  baseColor: string;
  accentColor: string;
  tertiaryColor: string;
  speed: number;
  ringSpeed: number;
  distance: number;
  count: number;
  coinSize: number;
  spread: number;
  borderWidth: number;
  borderWrapPosition: BorderWrapPosition;
  rounded: number;
  glow: number;
  neonLength: number;
  neonPosition: number;
  borderAspect: number;
  borderIllustration?: BorderIllustration;
  borderOverlayIllustrations?: BorderIllustration[];
  innerRadius: number;
  discProportions?: number[];
  discCurve?: DiscCurveSettings;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontFace: string;
  fontWeight: number;
  shinyGraphic?: ShinyGraphic;
  shinyGraphicScale: number;
  interactionTrack: InteractionSample[];
  lightBloom: LightBloomSettings;
  frostedTypeBand: FrostedTypeBandSettings;
  paperImage: PaperImageSettings;
  ripple: InspiraRippleSettings;
  pngCompression: boolean;
  keepFrames: boolean;
  material: string;
  materialEnabled: boolean;
  frontTexture?: string;
  backTexture?: string;
};

export type BrowserExportProgress = {
  stage: string;
  frame: number;
  totalFrames: number;
  progress: number;
};

export type BrowserExportResult = {
  outputName: string;
  frames: number;
  encoder: "native" | "browser" | "apng";
};

const activeControllers = new Map<BrowserExportFormat, AbortController>();
const activeEncoders = new Map<BrowserExportFormat, FFmpeg>();
const activeNativeSessions = new Map<BrowserExportFormat, NativeExportSession>();
let coreUrls: Promise<[string, string]> | null = null;

const cancelled = (signal: AbortSignal) => {
  if (signal.aborted)
    throw signal.reason ?? new DOMException("已取消导出", "AbortError");
};

const wait = <T>(promise: Promise<T>, signal: AbortSignal, timeout = 120_000) =>
  new Promise<T>((resolve, reject) => {
    cancelled(signal);
    const finish = (
      callback: (value: T | unknown) => void,
      value: T | unknown,
    ) => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () =>
      finish(
        reject,
        signal.reason ?? new DOMException("已取消导出", "AbortError"),
      );
    const timer = window.setTimeout(
      () =>
        finish(reject, new Error("处理超时，请降低导出尺寸、帧率或时长后重试")),
      timeout,
    );
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(resolve as (value: T | unknown) => void, value),
      (error) => finish(reject, error),
    );
  });

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("无法创建透明 PNG 帧")),
      "image/png",
    ),
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function appleVendor(bytes: Uint8Array) {
  const from = [0x46, 0x46, 0x4d, 0x50];
  const to = [0x61, 0x70, 0x6c, 0x30];
  for (let index = 0; index <= bytes.length - from.length; index += 1) {
    if (from.every((value, offset) => bytes[index + offset] === value))
      bytes.set(to, index);
  }
  return bytes;
}

function validate(settings: BrowserExportSettings) {
  const frames = Math.max(
    1,
    Math.round((settings.duration + settings.delay) * settings.fps),
  );
  if (
    settings.width < 64 ||
    settings.height < 64 ||
    settings.width > 8192 ||
    settings.height > 8192
  )
    throw new Error("输出尺寸超出浏览器安全范围");
  if (
    settings.width * settings.height > 32 * 1024 * 1024 ||
    frames > 3600 ||
    settings.width * settings.height * frames > 2_000_000_000
  )
    throw new Error("本次导出规模过大，请降低尺寸、帧率或时长");
  return frames;
}

type RenderSession = {
  totalFrames: number;
  width: number;
  height: number;
  renderFrame: (index: number) => Promise<HTMLCanvasElement>;
  close: () => void;
};

async function createRenderSession(
  settings: BrowserExportSettings,
  signal: AbortSignal,
): Promise<RenderSession> {
  const totalFrames = validate(settings);
  const illustrationKey = settings.borderIllustration ? crypto.randomUUID() : undefined;
  const overlayIllustrationsKey = settings.borderOverlayIllustrations?.length ? crypto.randomUUID() : undefined;
  const shinyGraphicKey = settings.shinyGraphic ? crypto.randomUUID() : undefined;
  if (illustrationKey) {
    window.__originKitBorderIllustrations ??= {};
    window.__originKitBorderIllustrations[illustrationKey] = settings.borderIllustration!;
  }
  if (overlayIllustrationsKey) {
    window.__originKitBorderOverlayIllustrations ??= {};
    window.__originKitBorderOverlayIllustrations[overlayIllustrationsKey] = settings.borderOverlayIllustrations!;
  }
  if (shinyGraphicKey) {
    window.__originKitShinyGraphics ??= {};
    window.__originKitShinyGraphics[shinyGraphicKey] = settings.shinyGraphic!;
  }
  const query = new URLSearchParams({
    render: "frame",
    width: String(settings.width),
    height: String(settings.height),
    duration: String(settings.duration),
    component: settings.componentId,
    background: settings.background,
    baseColor: settings.baseColor,
    accentColor: settings.accentColor,
    tertiaryColor: settings.tertiaryColor,
    speed: String(settings.speed),
    ringSpeed: String(settings.ringSpeed),
    distance: String(settings.distance),
    count: String(settings.count),
    coinSize: String(settings.coinSize),
    spread: String(settings.spread),
    borderWidth: String(settings.borderWidth),
    borderWrapPosition: settings.borderWrapPosition,
    rounded: String(settings.rounded),
    glow: String(settings.glow),
    neonLength: String(settings.neonLength),
    neonPosition: String(settings.neonPosition),
    borderAspect: String(settings.borderAspect),
    ...(illustrationKey ? { borderIllustrationKey: illustrationKey } : {}),
    ...(overlayIllustrationsKey ? { borderOverlayIllustrationsKey: overlayIllustrationsKey } : {}),
    innerRadius: String(settings.innerRadius),
    discProportions: JSON.stringify(settings.discProportions ?? []),
    discCurve: JSON.stringify(settings.discCurve),
    text: settings.text,
    fontSize: String(settings.fontSize),
    fontFamily: settings.fontFamily,
    fontFace: settings.fontFace,
    fontWeight: String(settings.fontWeight),
    ...(shinyGraphicKey ? { shinyGraphicKey } : {}),
    shinyGraphicScale: String(settings.shinyGraphicScale),
    interaction: JSON.stringify(settings.interactionTrack),
    bloomStyle: settings.lightBloom.variant,
    bloomDirection: settings.lightBloom.direction,
    bloomBackground: settings.lightBloom.background,
    bloomHover: String(settings.lightBloom.hover),
    bloomRise: String(settings.lightBloom.rise),
    bloomSpread: String(settings.lightBloom.spread),
    shaftCount: String(settings.lightBloom.shaftCount),
    shaftAmount: String(settings.lightBloom.shaftAmount),
    shaftDrift: String(settings.lightBloom.shaftDrift),
    bloomGrain: String(settings.lightBloom.grain),
    bloomVignette: String(settings.lightBloom.vignette),
    frostedTypeBand: JSON.stringify(settings.frostedTypeBand),
    paperImage: JSON.stringify(settings.paperImage),
    ripple: JSON.stringify(settings.ripple),
    canvasAspect: String(settings.width / Math.max(1, settings.height)),
    material: settings.material,
    materialEnabled: String(settings.materialEnabled),
    ...(settings.frontTexture ? { frontTexture: settings.frontTexture } : {}),
    ...(settings.backTexture ? { backTexture: settings.backTexture } : {}),
  });
  const frame = document.createElement("iframe");
  frame.title = "离屏逐帧渲染器";
  frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${settings.width}px;height:${settings.height}px;border:0;pointer-events:none`;
  frame.src = `${location.origin}${location.pathname}?${query}`;
  document.body.append(frame);
  const close = () => {
    frame.remove();
    if (illustrationKey && window.__originKitBorderIllustrations) {
      delete window.__originKitBorderIllustrations[illustrationKey];
    }
    if (overlayIllustrationsKey && window.__originKitBorderOverlayIllustrations) {
      delete window.__originKitBorderOverlayIllustrations[overlayIllustrationsKey];
    }
    if (shinyGraphicKey && window.__originKitShinyGraphics) {
      delete window.__originKitShinyGraphics[shinyGraphicKey];
    }
  };
  try {
    await wait(
      new Promise<void>((resolve, reject) => {
        frame.onload = () => resolve();
        frame.onerror = () => reject(new Error("离屏渲染页面加载失败"));
      }),
      signal,
    );
    const child = frame.contentWindow;
    const documentInFrame = frame.contentDocument;
    if (!child || !documentInFrame) throw new Error("无法访问离屏渲染页面");
    while (
      !child.__originKitRenderAt ||
      !documentInFrame.querySelector("[data-testid='export-stage']")
    ) {
      cancelled(signal);
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
    if (child.__originKitAssetsReady) await wait(child.__originKitAssetsReady, signal);
    const stage = documentInFrame.querySelector(
      "[data-testid='export-stage']",
    ) as HTMLElement;
    const canvasSelector =
      settings.componentId === "coin-loader"
        ? "[data-testid='coin-loader-canvas']"
        : settings.componentId === "disc-split"
          ? "[data-testid='disc-split-canvas']"
          : settings.componentId === "gyro-loader"
            ? "[data-testid='gyro-loader-canvas']"
            : settings.componentId === "light-bloom"
              ? "canvas.motion-root"
              : "";
    const source = canvasSelector
      ? documentInFrame.querySelector(canvasSelector) as HTMLCanvasElement | null
      : null;
    const composed = document.createElement("canvas");
    composed.width = settings.width;
    composed.height = settings.height;
    const context = composed.getContext("2d", { alpha: true })!;
    const renderAt = child.__originKitRenderAt;
    if (!renderAt) throw new Error("离屏渲染器尚未准备完成");
    const renderFrame = async (index: number) => {
      cancelled(signal);
      const time = Math.max(0, index / settings.fps - settings.delay);
      renderAt(time);
      await new Promise((resolve) =>
        child.requestAnimationFrame(() => child.requestAnimationFrame(resolve)),
      );
      context.clearRect(0, 0, composed.width, composed.height);
      if (settings.background !== "transparent" && !settings.adaptiveCanvas) {
        context.fillStyle = settings.background;
        context.fillRect(0, 0, composed.width, composed.height);
      }
      const captured = child.__originKitCaptureFrame
        ? await wait(child.__originKitCaptureFrame(), signal)
        : null;
      if (captured)
        context.drawImage(captured, 0, 0, composed.width, composed.height);
      else if (source)
        context.drawImage(source, 0, 0, composed.width, composed.height);
      else {
        const { toCanvas } = await import("html-to-image");
        const raster = await wait(
          toCanvas(stage, {
            width: settings.width,
            height: settings.height,
            pixelRatio: 1,
            skipFonts: true,
          }),
          signal,
        );
        context.drawImage(raster, 0, 0, composed.width, composed.height);
      }
      return composed;
    };
    return {
      totalFrames,
      width: settings.width,
      height: settings.height,
      renderFrame,
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}

function includeBounds(union: PixelBounds | null, bounds: PixelBounds | null) {
  if (!bounds) return union;
  if (!union) return bounds;
  return {
    left: Math.min(union.left, bounds.left),
    top: Math.min(union.top, bounds.top),
    right: Math.max(union.right, bounds.right),
    bottom: Math.max(union.bottom, bounds.bottom),
  };
}

async function calculateAdaptiveCrop(
  session: RenderSession,
  signal: AbortSignal,
  report: (progress: BrowserExportProgress) => void,
) {
  let union: PixelBounds | null = null;
  for (let index = 0; index < session.totalFrames; index += 1) {
    cancelled(signal);
    const canvas = await session.renderFrame(index);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    union = includeBounds(
      union,
      adaptiveAlphaBounds(
        context.getImageData(0, 0, session.width, session.height).data,
        session.width,
        session.height,
      ),
    );
    report({
      stage: "正在计算可见区域",
      frame: index + 1,
      totalFrames: session.totalFrames,
      progress: ((index + 1) / session.totalFrames) * 35,
    });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }
  if (!union) return { left: 0, top: 0, width: session.width, height: session.height };
  // Preserve a small safety edge around the perceptually visible glow.
  const left = Math.max(0, union.left - ADAPTIVE_SAFETY_PADDING);
  const top = Math.max(0, union.top - ADAPTIVE_SAFETY_PADDING);
  const right = Math.min(session.width - 1, union.right + ADAPTIVE_SAFETY_PADDING);
  const bottom = Math.min(session.height - 1, union.bottom + ADAPTIVE_SAFETY_PADDING);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function loadEncoder(format: BrowserExportFormat, signal: AbortSignal) {
  if (!coreUrls)
    coreUrls = Promise.all([
      toBlobURL(
        "/ffmpeg-core/ffmpeg-core.js?v=turntable-7.1-r1",
        "text/javascript",
      ),
      toBlobURL(
        "/ffmpeg-core/ffmpeg-core.wasm?v=turntable-7.1-r1",
        "application/wasm",
      ),
    ]);
  const [coreURL, wasmURL] = await wait(coreUrls, signal);
  const ffmpeg = new FFmpeg();
  activeEncoders.set(format, ffmpeg);
  await wait(ffmpeg.load({ coreURL, wasmURL }), signal);
  return ffmpeg;
}

export async function exportInBrowser(
  format: BrowserExportFormat,
  settings: BrowserExportSettings,
  report: (progress: BrowserExportProgress) => void,
): Promise<BrowserExportResult> {
  if (activeControllers.has(format)) throw new Error(`已有 ${format === "mov" ? "MOV" : "PNG 动图"}导出任务正在运行`);
  const controller = new AbortController();
  activeControllers.set(format, controller);
  const signal = controller.signal;
  let ffmpeg: FFmpeg | null = null;
  let session: RenderSession | null = null;
  try {
    report({
      stage: "正在准备渲染器",
      frame: 0,
      totalFrames: validate(settings),
      progress: 1,
    });
    session = await createRenderSession(settings, signal);
    const totalFrames = session.totalFrames;
    const staticCrop = settings.adaptiveCanvas
      ? staticBorderAdaptiveCrop(settings)
      : null;
    const crop = settings.adaptiveCanvas
      ? staticCrop ?? await calculateAdaptiveCrop(session, signal, report)
      : { left: 0, top: 0, width: session.width, height: session.height };
    if (staticCrop) {
      report({
        stage: "正在计算可见区域",
        frame: totalFrames,
        totalFrames,
        progress: 35,
      });
    }
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = crop.width;
    outputCanvas.height = crop.height;
    const outputContext = outputCanvas.getContext("2d", { alpha: true })!;
    const stamp = Date.now();
    const outputName = format === "apng"
      ? `OriginKit-${settings.componentName}-${stamp}.png`
      : `OriginKit-${settings.componentName}-${stamp}-prores4444xq.mov`;
    let nativeSession: NativeExportSession | null = null;
    let apng: FullFrameApngBuilder | null = null;
    if (format === "mov" || format === "apng") {
      report({
        stage: format === "mov" ? "正在检测本机 FFmpeg" : "正在检测本机完整帧编码器",
        frame: 0,
        totalFrames,
        progress: settings.adaptiveCanvas ? 36 : 1,
      });
      const native = await detectNativeExporter(format, signal);
      if (native) {
        try {
          nativeSession = await startNativeExport(format, settings.fps, outputName, settings.pngCompression, totalFrames, native.endpoint, signal);
          activeNativeSessions.set(format, nativeSession);
          report({ stage: format === "mov" ? "本机 FFmpeg 加持，神速" : "本机完整帧编码加持，神速", frame: 0, totalFrames, progress: settings.adaptiveCanvas ? 36 : 1 });
        } catch {
          nativeSession = null;
        }
      }
      if (!nativeSession && format === "mov") {
        report({ stage: "正在加载浏览器编码器", frame: 0, totalFrames, progress: settings.adaptiveCanvas ? 36 : 1 });
        ffmpeg = await loadEncoder(format, signal);
      } else if (!nativeSession) {
        report({ stage: "正在准备浏览器 PNG 动图编码器", frame: 0, totalFrames, progress: settings.adaptiveCanvas ? 36 : 1 });
        apng = new FullFrameApngBuilder(totalFrames, settings.fps);
      }
    }
    const sequenceEntries: Record<string, Uint8Array> | null = settings.keepFrames ? {} : null;
    const renderProgressStart = settings.adaptiveCanvas ? 35 : 0;
    for (let index = 0; index < totalFrames; index += 1) {
      cancelled(signal);
      const source = await session.renderFrame(index);
      outputContext.clearRect(0, 0, crop.width, crop.height);
      if (settings.background !== "transparent") {
        outputContext.fillStyle = settings.background;
        outputContext.fillRect(0, 0, crop.width, crop.height);
      }
      outputContext.drawImage(
        source,
        crop.left,
        crop.top,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
      const blob = await wait(canvasToBlob(outputCanvas), signal);
      if (sequenceEntries) {
        sequenceEntries[`OriginKit-${settings.componentName}-${String(index + 1).padStart(5, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      if (nativeSession) {
        await appendNativeFrame(nativeSession, blob, signal);
      } else if (apng) {
        await apng.addFrame(blob);
      } else if (ffmpeg) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const frameName = `frame_${String(index).padStart(5, "0")}.png`;
        // canvas.toBlob already supplies a lossless PNG. Re-encoding every
        // intermediate frame with a separate ffmpeg.wasm process cannot
        // improve the final ProRes image; it only reduces temporary file size
        // while multiplying export time by the number of frames.
        await wait(ffmpeg.writeFile(frameName, bytes), signal);
      }
      report({
        stage:
          format === "apng"
            ? nativeSession
              ? "本机完整帧编码加持，神速"
              : "正在编码完整 PNG 帧"
            : nativeSession
              ? "本机 FFmpeg 加持，神速"
              : "正在准备浏览器编码器",
        frame: index + 1,
        totalFrames,
        progress: renderProgressStart + ((index + 1) / totalFrames) * (84 - renderProgressStart),
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    if (sequenceEntries) {
      report({ stage: "正在打包 PNG 序列", frame: totalFrames, totalFrames, progress: 84 });
      const archive = zipSync(sequenceEntries, { level: 0 });
      download(new Blob([archive as BlobPart], { type: "application/zip" }), `OriginKit-${settings.componentName}-${Date.now()}-png-sequence.zip`);
    }
    if (nativeSession) {
      report({ stage: format === "mov" ? "本机 FFmpeg 加持，神速" : "本机完整帧编码加持，神速", frame: totalFrames, totalFrames, progress: 85 });
      const result = await finishNativeExport(nativeSession, signal);
      activeNativeSessions.delete(format);
      nativeSession = null;
      downloadNativeExport(result.downloadUrl, result.outputName);
      return { outputName: result.outputName, frames: totalFrames, encoder: "native" };
    }
    if (apng) {
      download(apng.finish(), outputName);
      return { outputName, frames: totalFrames, encoder: "apng" };
    }
    const args = [
      "-framerate",
      String(settings.fps),
      "-i",
      "frame_%05d.png",
      "-c:v",
      "prores_ks",
      "-profile:v",
      "5",
      "-bits_per_mb",
      "8000",
      "-pix_fmt",
      "yuva444p10le",
      "-alpha_bits",
      "16",
      "-vendor",
      "apl0",
      outputName,
    ];
    report({
      stage: "正在编码 ProRes",
      frame: totalFrames,
      totalFrames,
      progress: 85,
    });
    if (!ffmpeg) throw new Error("MOV 编码器没有正确加载");
    const exitCode = await wait(ffmpeg.exec(args), signal, 10 * 60_000);
    if (exitCode !== 0) throw new Error(`浏览器编码失败，错误码 ${exitCode}`);
    const output = await wait(ffmpeg.readFile(outputName), signal);
    if (typeof output === "string") throw new Error("编码器返回了无效文件");
    const bytes = appleVendor(output);
    download(
      new Blob([bytes as BlobPart], {
        type: "video/quicktime",
      }),
      outputName,
    );
    return { outputName, frames: totalFrames, encoder: "browser" };
  } finally {
    const nativeSession = activeNativeSessions.get(format);
    if (nativeSession) cancelNativeExport(nativeSession);
    session?.close();
    ffmpeg?.terminate();
    activeEncoders.delete(format);
    activeNativeSessions.delete(format);
    activeControllers.delete(format);
  }
}

export function cancelBrowserExport(format: BrowserExportFormat) {
  const nativeSession = activeNativeSessions.get(format);
  if (nativeSession) cancelNativeExport(nativeSession);
  activeControllers.get(format)?.abort(new DOMException("已取消导出", "AbortError"));
  activeEncoders.get(format)?.terminate();
}
