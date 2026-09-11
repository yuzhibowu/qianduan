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
import { buildFullFrameApng } from "./apng";

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
  speed: number;
  ringSpeed: number;
  distance: number;
  count: number;
  coinSize: number;
  spread: number;
  borderWidth: number;
  rounded: number;
  glow: number;
  neonLength: number;
  neonPosition: number;
  borderAspect: number;
  borderIllustration?: BorderIllustration;
  innerRadius: number;
  discProportions?: number[];
  discCurve?: DiscCurveSettings;
  text: string;
  fontSize: number;
  fontFamily: string;
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

const FRAME_MEMORY_LIMIT = 192 * 1024 * 1024;
let activeController: AbortController | null = null;
let activeEncoder: FFmpeg | null = null;
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

async function renderFrames(
  settings: BrowserExportSettings,
  signal: AbortSignal,
  report: (progress: BrowserExportProgress) => void,
) {
  const totalFrames = validate(settings);
  const illustrationKey = settings.borderIllustration ? crypto.randomUUID() : undefined;
  if (illustrationKey) {
    window.__originKitBorderIllustrations ??= {};
    window.__originKitBorderIllustrations[illustrationKey] = settings.borderIllustration!;
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
    speed: String(settings.speed),
    ringSpeed: String(settings.ringSpeed),
    distance: String(settings.distance),
    count: String(settings.count),
    coinSize: String(settings.coinSize),
    spread: String(settings.spread),
    borderWidth: String(settings.borderWidth),
    rounded: String(settings.rounded),
    glow: String(settings.glow),
    neonLength: String(settings.neonLength),
    neonPosition: String(settings.neonPosition),
    borderAspect: String(settings.borderAspect),
    ...(illustrationKey ? { borderIllustrationKey: illustrationKey } : {}),
    innerRadius: String(settings.innerRadius),
    discProportions: JSON.stringify(settings.discProportions ?? []),
    discCurve: JSON.stringify(settings.discCurve),
    text: settings.text,
    fontSize: String(settings.fontSize),
    fontFamily: settings.fontFamily,
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
  const frames: Blob[] = [];
  let storedBytes = 0;
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
    for (let index = 0; index < totalFrames; index += 1) {
      cancelled(signal);
      const time = Math.max(0, index / settings.fps - settings.delay);
      child.__originKitRenderAt(time);
      await new Promise((resolve) =>
        child.requestAnimationFrame(() => child.requestAnimationFrame(resolve)),
      );
      context.clearRect(0, 0, composed.width, composed.height);
      if (settings.background !== "transparent" && !settings.adaptiveCanvas) {
        context.fillStyle = settings.background;
        context.fillRect(0, 0, composed.width, composed.height);
      }
      if (source)
        context.drawImage(source, 0, 0, composed.width, composed.height);
      else {
        const { toCanvas } = await import("html-to-image");
        const raster = await toCanvas(stage, {
          width: settings.width,
          height: settings.height,
          pixelRatio: 1,
          skipFonts: true,
        });
        context.drawImage(raster, 0, 0, composed.width, composed.height);
      }
      const blob = await wait(canvasToBlob(composed), signal);
      storedBytes += blob.size;
      if (storedBytes > FRAME_MEMORY_LIMIT)
        throw new Error("帧数据已达到 192 MB 内存保护上限，请降低导出规格");
      frames.push(blob);
      report({
        stage: "Rendering Frames",
        frame: index + 1,
        totalFrames,
        progress: ((index + 1) / totalFrames) * 72,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    return frames;
  } finally {
    frame.remove();
    if (illustrationKey && window.__originKitBorderIllustrations) {
      delete window.__originKitBorderIllustrations[illustrationKey];
    }
  }
}

type PixelBounds = { left: number; top: number; right: number; bottom: number };

function alphaBounds(data: Uint8ClampedArray, width: number, height: number): PixelBounds | null {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : { left, top, right, bottom };
}

async function cropFramesToVisibleArea(
  frames: Blob[],
  width: number,
  height: number,
  background: string,
  signal: AbortSignal,
) {
  const decoded: ImageBitmap[] = [];
  let union: PixelBounds | null = null;
  try {
    for (const frame of frames) {
      cancelled(signal);
      const bitmap = await createImageBitmap(frame);
      decoded.push(bitmap);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      const bounds = alphaBounds(context.getImageData(0, 0, width, height).data, width, height);
      if (bounds) union = union
        ? {
            left: Math.min(union.left, bounds.left),
            top: Math.min(union.top, bounds.top),
            right: Math.max(union.right, bounds.right),
            bottom: Math.max(union.bottom, bounds.bottom),
          }
        : bounds;
    }
    if (!union) return { frames, width, height };
    // Keep one transparent pixel around the union so glow is never clipped at the file edge.
    const left = Math.max(0, union.left - 1);
    const top = Math.max(0, union.top - 1);
    const right = Math.min(width - 1, union.right + 1);
    const bottom = Math.min(height - 1, union.bottom + 1);
    const cropWidth = right - left + 1;
    const cropHeight = bottom - top + 1;
    const cropped: Blob[] = [];
    for (const bitmap of decoded) {
      cancelled(signal);
      const canvas = document.createElement("canvas");
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const context = canvas.getContext("2d", { alpha: true })!;
      if (background !== "transparent") {
        context.fillStyle = background;
        context.fillRect(0, 0, cropWidth, cropHeight);
      }
      context.drawImage(bitmap, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      cropped.push(await wait(canvasToBlob(canvas), signal));
    }
    return { frames: cropped, width: cropWidth, height: cropHeight };
  } finally {
    decoded.forEach((bitmap) => bitmap.close());
  }
}

async function loadEncoder(signal: AbortSignal) {
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
  activeEncoder = ffmpeg;
  await wait(ffmpeg.load({ coreURL, wasmURL }), signal);
  return ffmpeg;
}

export async function exportInBrowser(
  format: BrowserExportFormat,
  settings: BrowserExportSettings,
  report: (progress: BrowserExportProgress) => void,
) {
  if (activeController) throw new Error("已有导出任务正在运行");
  const controller = new AbortController();
  activeController = controller;
  const signal = controller.signal;
  let ffmpeg: FFmpeg | null = null;
  try {
    let frames = await renderFrames(settings, signal, report);
    if (settings.adaptiveCanvas) {
      report({ stage: "Calculating Visible Area", frame: frames.length, totalFrames: frames.length, progress: 73 });
      frames = (await cropFramesToVisibleArea(
        frames,
        settings.width,
        settings.height,
        settings.background,
        signal,
      )).frames;
    }
    if (settings.keepFrames) {
      report({ stage: "Packaging PNG Sequence", frame: frames.length, totalFrames: frames.length, progress: 73 });
      const entries: Record<string, Uint8Array> = {};
      for (let index = 0; index < frames.length; index += 1)
        entries[`OriginKit-${settings.componentName}-${String(index + 1).padStart(5, "0")}.png`] = new Uint8Array(await frames[index].arrayBuffer());
      const archive = zipSync(entries, { level: 0 });
      download(new Blob([archive as BlobPart], { type: "application/zip" }), `OriginKit-${settings.componentName}-${Date.now()}-png-sequence.zip`);
    }
    if (format === "apng") {
      report({ stage: "Encoding Full Frames", frame: frames.length, totalFrames: frames.length, progress: 85 });
      const bytes = await buildFullFrameApng(frames, settings.fps);
      const outputName = `OriginKit-${settings.componentName}-${Date.now()}.png`;
      download(new Blob([bytes as BlobPart], { type: "image/png" }), outputName);
      return { outputName, frames: frames.length };
    }
    report({
      stage: "Loading Encoder",
      frame: frames.length,
      totalFrames: frames.length,
      progress: 74,
    });
    ffmpeg = await loadEncoder(signal);
    const names = frames.map(
      (_, index) => `frame_${String(index).padStart(5, "0")}.png`,
    );
    for (let index = 0; index < frames.length; index += 1) {
      cancelled(signal);
      const bytes = new Uint8Array(await frames[index].arrayBuffer());
      if (format === "mov" && settings.pngCompression) {
        const rawName = `raw_${String(index).padStart(5, "0")}.png`;
        await wait(ffmpeg.writeFile(rawName, bytes), signal);
        const compressed = await wait(
          ffmpeg.exec([
            "-y",
            "-i",
            rawName,
            "-frames:v",
            "1",
            "-compression_level",
            "9",
            "-pred",
            "mixed",
            names[index],
          ]),
          signal,
        );
        await ffmpeg.deleteFile(rawName);
        if (compressed !== 0)
          throw new Error(`第 ${index + 1} 帧 PNG 压缩失败`);
      } else {
        await wait(ffmpeg.writeFile(names[index], bytes), signal);
      }
      report({
        stage:
          format === "mov" && settings.pngCompression
            ? "Compressing PNG Frames"
            : "Preparing Encoder",
        frame: index + 1,
        totalFrames: frames.length,
        progress: 74 + ((index + 1) / frames.length) * 10,
      });
    }
    const stamp = Date.now();
    const outputName =
      format === "mov"
        ? `OriginKit-${settings.componentName}-${stamp}-prores4444xq.mov`
        : `OriginKit-${settings.componentName}-${stamp}.png`;
    const args =
      format === "mov"
        ? [
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
          ]
        : [
            "-framerate",
            String(settings.fps),
            "-i",
            "frame_%05d.png",
            "-plays",
            "0",
            ...(settings.pngCompression ? ["-pred", "mixed"] : []),
            "-f",
            "apng",
            outputName,
          ];
    report({
      stage: format === "mov" ? "Encoding ProRes" : "Encoding APNG",
      frame: frames.length,
      totalFrames: frames.length,
      progress: 85,
    });
    const exitCode = await wait(ffmpeg.exec(args), signal, 10 * 60_000);
    if (exitCode !== 0) throw new Error(`浏览器编码失败，错误码 ${exitCode}`);
    const output = await wait(ffmpeg.readFile(outputName), signal);
    if (typeof output === "string") throw new Error("编码器返回了无效文件");
    const bytes = format === "mov" ? appleVendor(output) : output;
    download(
      new Blob([bytes as BlobPart], {
        type: format === "mov" ? "video/quicktime" : "image/png",
      }),
      outputName,
    );
    return { outputName, frames: frames.length };
  } finally {
    ffmpeg?.terminate();
    activeEncoder = null;
    activeController = null;
  }
}

export function cancelBrowserExport() {
  activeController?.abort(new DOMException("已取消导出", "AbortError"));
  activeEncoder?.terminate();
}
