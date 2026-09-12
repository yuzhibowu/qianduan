export type LocalFontData = {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
  blob?: () => Promise<Blob>;
};

export type LocalFontFace = {
  id: string;
  label: string;
  family: string;
  weight: number;
};

const WEIGHT_MARKERS: Array<[RegExp, number]> = [
  [/(ultra|extra)[ -]?light|超细|纤细/i, 200],
  [/thin|细体/i, 100],
  [/light|细|轻/i, 300],
  [/(semi|demi)[ -]?bold|中粗/i, 600],
  [/(extra|ultra)[ -]?bold|特粗|超粗/i, 800],
  [/black|heavy|重|黑体/i, 900],
  [/bold|粗体|粗/i, 700],
  [/medium|中黑|中等/i, 500],
  [/regular|normal|book|常规|普通/i, 400],
];

export function fontFaceWeight(label: string) {
  return WEIGHT_MARKERS.find(([pattern]) => pattern.test(label))?.[1] ?? 400;
}

export function fontFaceStyleKey(label: string) {
  let style = label.toLocaleLowerCase();
  for (const [pattern] of WEIGHT_MARKERS) style = style.replace(pattern, " ");
  return style.replace(/[\s\-_]/g, "");
}

export function localFontFaces(fonts: LocalFontData[], family: string): LocalFontFace[] {
  const byId = new Map<string, LocalFontFace>();
  for (const font of fonts) {
    if (font.family !== family) continue;
    const id = font.postscriptName?.trim() || font.fullName?.trim();
    if (!id || byId.has(id)) continue;
    const label = font.style?.trim() || font.fullName?.trim() || id;
    byId.set(id, { id, label, family, weight: fontFaceWeight(label) });
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "zh-CN", { numeric: true }),
  );
}

export function matchingFontFace(
  faces: LocalFontFace[],
  currentFace: string,
  targetWeight: number,
) {
  const current = faces.find((face) => face.id === currentFace);
  if (!current) return currentFace;
  const style = fontFaceStyleKey(current.label);
  const sameStyle = faces.filter((face) => fontFaceStyleKey(face.label) === style);
  if (sameStyle.length < 2) return currentFace;
  return sameStyle.reduce((best, face) =>
    Math.abs(face.weight - targetWeight) < Math.abs(best.weight - targetWeight) ? face : best,
  ).id;
}

function quotedFontName(value: string) {
  return `'${value.replace(/[\\']/g, " ")}'`;
}

/**
 * 字样是当前字体家族下的一款具体字体。它优先于家族名，但家族名仍作为
 * 字样缺失或换机器后的安全回退，确保预览与逐帧导出不会整段丢字。
 */
export function fontFamilyStack(family: string, face?: string) {
  const entries = [face, family]
    .map((value) => value?.trim())
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .map(quotedFontName);
  return [...entries, "ui-sans-serif", "system-ui", "sans-serif"].join(", ");
}
