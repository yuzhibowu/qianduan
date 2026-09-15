export type NativeExportSession = {
  id: string;
  outputName: string;
  endpoint: string;
};

export type NativeExportFormat = "mov" | "apng";

type NativeCapabilities = {
  available: boolean;
  ffmpegVersion?: string;
  prores4444?: boolean;
  nativeApng?: boolean;
};

const endpoints = location.hostname === "127.0.0.1" || location.hostname === "localhost"
  ? ["/__native-export", "http://127.0.0.1:43987/v1"]
  : ["http://127.0.0.1:43987/v1"];

async function responseError(response: Response) {
  const text = await response.text().catch(() => "");
  return text || `本机导出助手返回 ${response.status}`;
}

export async function detectNativeExporter(format: NativeExportFormat, signal: AbortSignal) {
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}/capabilities`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) continue;
      const capabilities = await response.json() as NativeCapabilities;
      const formatAvailable = format === "mov"
        ? capabilities.prores4444
        : capabilities.nativeApng;
      if (capabilities.available && formatAvailable) return { ...capabilities, endpoint };
    } catch {
      // Try the next trusted local bridge, then fall back to browser encoding.
    }
  }
  return null;
}

export async function startNativeExport(
  format: NativeExportFormat,
  fps: number,
  outputName: string,
  pngCompression: boolean,
  totalFrames: number,
  width: number,
  height: number,
  endpoint: string,
  signal: AbortSignal,
) {
  const response = await fetch(`${endpoint}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, fps, outputName, pngCompression, totalFrames, width, height }),
    signal,
  });
  if (!response.ok) throw new Error(await responseError(response));
  return { ...await response.json() as Omit<NativeExportSession, "endpoint">, endpoint };
}

export async function appendNativeFrame(
  session: NativeExportSession,
  frame: Blob,
  signal: AbortSignal,
  region?: { x: number; y: number; width?: number; height?: number; canvasWidth: number; canvasHeight: number; blend: "source" | "over"; encoding?: "png" | "rgba" },
) {
  const response = await fetch(`${session.endpoint}/frame/${encodeURIComponent(session.id)}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      ...(region ? {
        "X-Frame-X": String(region.x),
        "X-Frame-Y": String(region.y),
        "X-Canvas-Width": String(region.canvasWidth),
        "X-Canvas-Height": String(region.canvasHeight),
        "X-Frame-Blend": region.blend,
        "X-Frame-Width": String(region.width ?? 0),
        "X-Frame-Height": String(region.height ?? 0),
        "X-Frame-Encoding": region.encoding ?? "png",
      } : {}),
    },
    body: frame,
    signal,
  });
  if (!response.ok) throw new Error(await responseError(response));
}

export async function finishNativeExport(
  session: NativeExportSession,
  signal: AbortSignal,
) {
  const response = await fetch(`${session.endpoint}/finish/${encodeURIComponent(session.id)}`, {
    method: "POST",
    signal,
  });
  if (!response.ok) throw new Error(await responseError(response));
  return await response.json() as { outputName: string; downloadUrl: string };
}

export function downloadNativeExport(downloadUrl: string, outputName: string) {
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = outputName;
  link.click();
}

export function cancelNativeExport(session: NativeExportSession) {
  void fetch(`${session.endpoint}/cancel/${encodeURIComponent(session.id)}`, {
    method: "POST",
    keepalive: true,
  }).catch(() => {});
}
