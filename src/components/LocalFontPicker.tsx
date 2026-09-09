import { useEffect, useRef, useState } from "react";

type LocalFontData = {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
  blob?: () => Promise<Blob>;
};

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
  onChange,
}: {
  value: string;
  onChange: (font: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState(COMMON_FONTS);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [hasReadLocalFonts, setHasReadLocalFonts] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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
    if (!window.queryLocalFonts) {
      setStatus("当前浏览器不能列出字体，可使用上方常见中文字体");
      return;
    }
    try {
      const local = await window.queryLocalFonts();
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
      const next = Array.from(new Set([value, ...chinese])).filter(Boolean).sort((a, b) =>
        a.localeCompare(b, "zh-CN", { numeric: true }),
      );
      setFonts(next);
      setHasReadLocalFonts(true);
      setStatus(
        canInspectGlyphs
          ? `已读取这台电脑的 ${next.length} 个中文字体`
          : `已读取这台电脑的 ${next.length} 个本机字体`,
      );
    } catch {
      setStatus("未获得本机字体权限");
    }
  };

  const visibleFonts = fonts.filter((font) =>
    font.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  return (
    <div className="local-font-picker" ref={rootRef}>
      <span className="local-font-label">中文字体</span>
      <button type="button" className="local-font-trigger" onClick={() => {
        const next = !open;
        setOpen(next);
        if (next && !hasReadLocalFonts) void readLocalFonts();
      }}>
        <span style={{ fontFamily: `'${value}', sans-serif` }}>{value}</span>
        <span className={`component-picker-arrow ${open ? "open" : ""}`} />
      </button>
      {open && (
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
                onClick={() => { onChange(font); setOpen(false); }}
              >
                {font}　中文预览
              </button>
            ))}
            {visibleFonts.length === 0 && <div className="local-font-empty">没有匹配的字体</div>}
          </div>
        </div>
      )}
    </div>
  );
}
