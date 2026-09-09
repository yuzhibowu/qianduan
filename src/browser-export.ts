import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { zipSync } from "fflate";

export type BrowserExportFormat = "mov" | "apng";

export type BrowserExportSettings = {
  componentId: string;
  componentName: string;
  width: number;
  height: number;
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
  pngCompression: boolean;
  keepFrames: boolean;
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
  const query = new URLSearchParams({
    render: "frame",
    width: String(settings.width),
    height: String(settings.height),
    duration: String(settings.duration),
    component: settings.componentId,
    background: "transparent",
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
    const source = documentInFrame.querySelector(
      "canvas",
    ) as HTMLCanvasElement | null;
    const stage = documentInFrame.querySelector(
      "[data-testid='export-stage']",
    ) as HTMLElement;
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
      if (settings.background !== "transparent") {
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
  const frames = await renderFrames(settings, signal, report);
  let ffmpeg: FFmpeg | null = null;
  try {
    if (settings.keepFrames) {
      report({
        stage: "Packaging PNG Sequence",
        frame: frames.length,
        totalFrames: frames.length,
        progress: 73,
      });
      const entries: Record<string, Uint8Array> = {};
      for (let index = 0; index < frames.length; index += 1)
        entries[
          `OriginKit-${settings.componentName}-${String(index + 1).padStart(5, "0")}.png`
        ] = new Uint8Array(await frames[index].arrayBuffer());
      const archive = zipSync(entries, { level: 0 });
      download(
        new Blob([archive as BlobPart], { type: "application/zip" }),
        `OriginKit-${settings.componentName}-${Date.now()}-png-sequence.zip`,
      );
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
      await wait(
        ffmpeg.writeFile(
          names[index],
          new Uint8Array(await frames[index].arrayBuffer()),
        ),
        signal,
      );
      report({
        stage: "Preparing Encoder",
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
