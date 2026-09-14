export type ExportAspect = "16:9" | "1:1" | "adaptive";
export type ExportResolutionPreset = "720p" | "1080p" | "2k" | "4k";

export const EXPORT_RESOLUTION_PRESETS: Record<
  ExportResolutionPreset,
  { width: number; height: number }
> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "2k": { width: 2560, height: 1440 },
  "4k": { width: 3840, height: 2160 },
};

export function dimensionsForExportPreset(
  preset: ExportResolutionPreset,
  aspect: ExportAspect,
) {
  const motherCanvas = EXPORT_RESOLUTION_PRESETS[preset];
  if (aspect === "1:1") {
    const edge = Math.min(motherCanvas.width, motherCanvas.height);
    return { width: edge, height: edge };
  }
  return { ...motherCanvas };
}

export function presetForExportDimensions(width: number, height: number) {
  return (Object.entries(EXPORT_RESOLUTION_PRESETS) as Array<
    [ExportResolutionPreset, { width: number; height: number }]
  >).find(([, size]) =>
    (size.width === width && size.height === height) ||
    (size.height === width && size.height === height)
  )?.[0] ?? null;
}
