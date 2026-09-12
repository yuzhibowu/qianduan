import { visibleAlphaBounds, type IllustrationBounds } from "./border-illustration";

export type ShinyGraphic = {
  src: string;
  name: string;
  mimeType: "image/png" | "image/svg+xml";
  naturalWidth: number;
  naturalHeight: number;
  bounds: IllustrationBounds;
  aspect: number;
};

declare global {
  interface Window {
    __originKitShinyGraphics?: Record<string, ShinyGraphic>;
  }
}

const BLOCKED_SVG_ELEMENTS = "script,foreignObject,iframe,object,embed,audio,video";

export function shinyGraphicKind(file: Pick<File, "name" | "type">) {
  const name = file.name.toLocaleLowerCase();
  if (file.type === "image/png" || name.endsWith(".png")) return "image/png" as const;
  if (file.type === "image/svg+xml" || name.endsWith(".svg")) return "image/svg+xml" as const;
  return undefined;
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("无法读取图形素材"));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取图形素材"));
    reader.readAsDataURL(file);
  });
}

export function sanitizeSvgText(source: string) {
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror") || document.documentElement.localName !== "svg") {
    throw new Error("SVG 文件内容无效");
  }
  document.querySelectorAll(BLOCKED_SVG_ELEMENTS).forEach((element) => element.remove());
  document.querySelectorAll("style").forEach((element) => {
    const css = element.textContent ?? "";
    if (/@import\b/i.test(css) || /url\(\s*["']?(?!#|data:image\/)/i.test(css)) element.remove();
  });
  document.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLocaleLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) element.removeAttribute(attribute.name);
      if ((name === "href" || name.endsWith(":href")) &&
          value && !value.startsWith("#") && !value.startsWith("data:image/")) {
        element.removeAttribute(attribute.name);
      }
      if ((name === "style" || name === "filter" || name === "fill" || name === "stroke") &&
          /url\((?!["']?#)/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return new XMLSerializer().serializeToString(document.documentElement);
}

function decodeImage(src: string) {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => image);
}

function analyzedCanvasSize(width: number, height: number) {
  const largest = Math.max(width, height, 1);
  const scale = Math.min(1, 2048 / largest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function scaleBounds(bounds: IllustrationBounds, fromWidth: number, fromHeight: number, toWidth: number, toHeight: number) {
  const xScale = toWidth / Math.max(1, fromWidth);
  const yScale = toHeight / Math.max(1, fromHeight);
  return {
    x: bounds.x * xScale,
    y: bounds.y * yScale,
    width: bounds.width * xScale,
    height: bounds.height * yScale,
  };
}

export async function inspectShinyGraphic(file: File): Promise<ShinyGraphic> {
  const mimeType = shinyGraphicKind(file);
  if (!mimeType) throw new Error("只支持静态 PNG 或独立 SVG 文件");
  let src: string;
  if (mimeType === "image/svg+xml") {
    const sanitized = sanitizeSvgText(await file.text());
    src = await readAsDataUrl(new Blob([sanitized], { type: mimeType }));
  } else {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ascii = new TextDecoder("latin1").decode(bytes);
    if (ascii.includes("acTL")) throw new Error("Shiny Pill 图形模式暂时只支持静态 PNG");
    src = await readAsDataUrl(new Blob([bytes], { type: mimeType }));
  }
  const image = await decodeImage(src);
  const naturalWidth = Math.max(1, image.naturalWidth);
  const naturalHeight = Math.max(1, image.naturalHeight);
  const analysis = analyzedCanvasSize(naturalWidth, naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = analysis.width;
  canvas.height = analysis.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法分析图形透明区域");
  context.drawImage(image, 0, 0, analysis.width, analysis.height);
  const pixels = context.getImageData(0, 0, analysis.width, analysis.height).data;
  const analyzedBounds = visibleAlphaBounds(pixels, analysis.width, analysis.height, 8);
  const bounds = scaleBounds(analyzedBounds, analysis.width, analysis.height, naturalWidth, naturalHeight);
  return {
    src,
    name: file.name || (mimeType === "image/svg+xml" ? "剪贴板 SVG" : "剪贴板 PNG"),
    mimeType,
    naturalWidth,
    naturalHeight,
    bounds,
    aspect: bounds.width / Math.max(1, bounds.height),
  };
}

export function shinyGraphicLayout(graphic: ShinyGraphic) {
  const { naturalWidth, naturalHeight, bounds } = graphic;
  return {
    width: `${(naturalWidth / Math.max(1, bounds.width)) * 100}%`,
    height: `${(naturalHeight / Math.max(1, bounds.height)) * 100}%`,
    left: `${(-bounds.x / Math.max(1, bounds.width)) * 100}%`,
    top: `${(-bounds.y / Math.max(1, bounds.height)) * 100}%`,
  };
}
