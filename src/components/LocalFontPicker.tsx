import { useEffect, useRef, useState } from "react";
import { localFontFaces, matchingFontFace, type LocalFontData } from "../font-catalog";
import Slider from "./Slider";

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

const COMMON_FONTS = [
  "PingFang SC",
  "Songti SC",
  "Heiti SC",
  "Kaiti SC",
  "STFangsong",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  "SimSun",
  "Noto Sans CJK SC",
  "Noto Serif CJK SC",
  "Inter",
];

export default function LocalFontPicker({
  value,
  faceValue = "",
  weightValue,
  defaultValue,
  defaultFaceValue = "",
  onChange,
  onFaceChange,
  onWeightChange,
}: {
  value: string;
  faceValue?: string;
  weightValue?: number;
  defaultValue?: string;
  defaultFaceValue?: string;
  onChange: (font: string) => void;
  onFaceChange?: (face: string) => void;
  onWeightChange?: (weight: number) => void;
}) {
  const [open, setOpen] = useState<"family" | "face" | null>(null);
  const [fonts, setFonts] = useState(COMMON_FONTS);
  const [localFonts, setLocalFonts] = useState<LocalFontData[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [hasReadLocalFonts, setHasReadLocalFonts] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const fontSignature = (stack: string) => {
    const sample = "中文测试饼";
    const canvas = document.createElement("canvas");
    canvas.width = 260;
    canvas.height = 52;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000";
    context.font = `32px ${stack}`;
    context.fillText(sample, 3, 38);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let index = 3; index < pixels.length; index += 4) {
      hash ^= pixels[index];
      hash = Math.imul(hash, 16777619);
    }
    return `${context.measureText(sample).width.toFixed(3)}:${hash >>> 0}`;
  };

  const supportsChinese = async (font: LocalFontData, index: number) => {
    if (!font.blob) return true;
    const alias = `LocalChineseFont${index}`;
    let face: FontFace | null = null;
    try {
      const bytes = await (await font.blob()).arrayBuffer();
      face = await new FontFace(alias, bytes).load();
      document.fonts.add(face);
    } catch {
      return false;
    }
    const fallback = `'__font_that_does_not_exist__', sans-serif`;
    const supported = fontSignature(`'${alias}', sans-serif`) !== fontSignature(fallback);
    if (face) document.fonts.delete(face);
    return supported;
  };

  const readLocalFonts = async () => {
    try {
      let local = window.queryLocalFonts ? await window.queryLocalFonts() : [];
      let fromLocalBridge = false;
      if (!local.some((font) => font.postscriptName || font.fullName)) {
        const response = await fetch("/__local-fonts");
        if (response.ok) {
          local = await response.json() as LocalFontData[];
          fromLocalBridge = true;
        }
      }
      if (local.length === 0) throw new Error("浏览器没有开放字体目录");
      setLocalFonts(local);
      setStatus("正在检测本机中文字体…");
      const familySamples = Array.from(
        local.reduce((map, font) => {
          const family = font.family.trim();
          if (family && !map.has(family)) map.set(family, font);
          return map;
        }, new Map<string, LocalFontData>()).values(),
      );
      const canInspectGlyphs = familySamples.some((font) => Boolean(font.blob));
      const support = await Promise.all(
        familySamples.map((font, index) => supportsChinese(font, index)),
      );
      const chinese = familySamples
        .filter((_, index) => support[index])
        .map((font) => font.family);
      const chineseFamilyCount = new Set(chinese).size;
      const next = Array.from(new Set([value, ...chinese])).filter(Boolean).sort((a, b) =>
        a.localeCompare(b, "zh-CN", { numeric: true }),
      );
      setFonts(next);
      setHasReadLocalFonts(true);
      setStatus(
        fromLocalBridge
          ? `已从本机读取 ${chineseFamilyCount} 个中文字体`
          : canInspectGlyphs
          ? `已读取这台电脑的 ${next.length} 个中文字体`
          : `已读取这台电脑的 ${next.length} 个本机字体`,
      );
    } catch {
      setStatus("内部浏览器未开放字体目录，本地服务也未能读取");
    }
  };

  const visibleFonts = fonts.filter((font) =>
    font.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const faces = localFontFaces(localFonts, value);
  const selectedFace = faces.find((face) => face.id === faceValue);
  const faceLabel = faceValue ? selectedFace?.label ?? `${faceValue}（缺失）` : "自动";

  const ensureLocalFonts = () => {
    if (!hasReadLocalFonts) void readLocalFonts();
  };

  return (
    <div className="local-font-picker" ref={rootRef}>
      <div className="local-font-control">
        <button
          type="button"
          className="local-font-label local-font-reset"
          title="恢复默认值"
          aria-label="字体，恢复默认值"
          onClick={() => {
            if (defaultValue) onChange(defaultValue);
            onFaceChange?.(defaultFaceValue);
          }}
        >字体</button>
        <button type="button" className="local-font-trigger" onClick={() => {
          const next = open === "family" ? null : "family";
          setOpen(next);
          if (next) ensureLocalFonts();
        }}>
          <span style={{ fontFamily: `'${value}', sans-serif` }}>{value}</span>
          <span className={`component-picker-arrow ${open === "family" ? "open" : ""}`} />
        </button>
        {open === "family" && (
          <div className="local-font-menu">
            <button type="button" className="local-font-read" onClick={readLocalFonts}>重新读取这台电脑的中文字体</button>
            {status && <div className="local-font-status">{status}</div>}
            <input
              className="local-font-search"
              type="search"
              value={search}
              placeholder="搜索字体"
              aria-label="搜索本机中文字体"
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="local-font-list">
              {visibleFonts.map((font) => (
                <button
                  type="button"
                  key={font}
                  className={font === value ? "selected" : ""}
                  style={{ fontFamily: `'${font}', sans-serif` }}
                  onClick={() => {
                    onChange(font);
                    onFaceChange?.("");
                    setOpen(null);
                  }}
                >
                  {font}　中文预览
                </button>
              ))}
              {visibleFonts.length === 0 && <div className="local-font-empty">没有匹配的字体</div>}
            </div>
          </div>
        )}
      </div>
      {onFaceChange && (
        <div className="local-font-control">
          <button
            type="button"
            className="local-font-label local-font-face-label local-font-reset"
            title="恢复默认值"
            aria-label="字样，恢复默认值"
            onClick={() => onFaceChange(defaultFaceValue)}
          >字样</button>
          <button type="button" className="local-font-trigger" onClick={() => {
            const next = open === "face" ? null : "face";
            setOpen(next);
            if (next) ensureLocalFonts();
          }}>
            <span style={{ fontFamily: faceValue ? `'${faceValue}', '${value}', sans-serif` : `'${value}', sans-serif` }}>
              {faceLabel}
            </span>
            <span className={`component-picker-arrow ${open === "face" ? "open" : ""}`} />
          </button>
          {open === "face" && (
            <div className="local-font-menu">
              <button
                type="button"
                className={`local-font-face-option ${faceValue ? "" : "selected"}`}
                onClick={() => { onFaceChange(""); setOpen(null); }}
              >
                自动
              </button>
              {faces.map((face) => (
                <button
                  type="button"
                  key={face.id}
                  className={`local-font-face-option ${face.id === faceValue ? "selected" : ""}`}
                  style={{ fontFamily: `'${face.id}', '${value}', sans-serif` }}
                  onClick={() => { onFaceChange(face.id); setOpen(null); }}
                >
                  {face.label}
                </button>
              ))}
              {faceValue && !selectedFace && (
                <button type="button" className="local-font-face-option selected" onClick={() => setOpen(null)}>
                  {faceValue}（缺失）
                </button>
              )}
              {faces.length === 0 && !faceValue && (
                <div className="local-font-empty">
                  {status || "读取本机字体后显示该字体的可用字样"}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {weightValue !== undefined && onWeightChange && (
        <Slider
          label="字重"
          value={weightValue}
          min={100}
          max={900}
          step={100}
          display={String(weightValue)}
          onChange={(nextWeight) => {
            if (faceValue && onFaceChange) {
              onFaceChange(matchingFontFace(faces, faceValue, nextWeight));
            }
            onWeightChange(nextWeight);
          }}
        />
      )}
    </div>
  );
}
