export type NativeExportSession = {
  id: string;
  outputName: string;
  endpoint: string;
  frameBatch: boolean;
};

export type NativeExportFormat = "mov" | "apng";

type NativeCapabilities = {
  available: boolean;
  ffmpegVersion?: string;
  prores4444?: boolean;
  nativeApng?: boolean;
  frameBatch?: boolean;
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
  endpoint: string,
  frameBatch: boolean,
  signal: AbortSignal,
) {
  const response = await fetch(`${endpoint}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, fps, outputName, pngCompression, totalFrames }),
    signal,
  });
  if (!response.ok) throw new Error(await responseError(response));
  return {
    ...await response.json() as Omit<NativeExportSession, "endpoint" | "frameBatch">,
    endpoint,
    frameBatch,
  };
}

export async function appendNativeFrame(
  session: NativeExportSession,
  frame: Blob,
  signal: AbortSignal,
) {
  const response = await fetch(`${session.endpoint}/frame/${encodeURIComponent(session.id)}`, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: frame,
    signal,
  });
  if (!response.ok) throw new Error(await responseError(response));
}

export async function appendNativeFrames(
  session: NativeExportSession,
  frames: Blob[],
  signal: AbortSignal,
) {
  if (!session.frameBatch || frames.length === 1) {
    for (const frame of frames) await appendNativeFrame(session, frame, signal);
    return;
  }
  const parts: BlobPart[] = [];
  for (const frame of frames) {
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, frame.size, false);
    parts.push(size, frame);
  }
  const response = await fetch(`${session.endpoint}/frames/${encodeURIComponent(session.id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Blob(parts, { type: "application/octet-stream" }),
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
