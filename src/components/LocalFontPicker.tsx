import { useEffect, useRef, useState } from "react";

type LocalFontData = { family: string; fullName?: string };

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const readLocalFonts = async () => {
    if (!window.queryLocalFonts) {
      setStatus("当前浏览器不能列出字体，可使用上方常见中文字体");
      return;
    }
    try {
      const local = await window.queryLocalFonts();
      const families = local.map((font) => font.family).filter(Boolean);
      setFonts(Array.from(new Set([...COMMON_FONTS, ...families])).sort((a, b) => a.localeCompare(b, "zh-CN")));
      setStatus(`已读取 ${new Set(families).size} 个本机字体`);
    } catch {
      setStatus("未获得本机字体权限");
    }
  };

  return (
    <div className="local-font-picker" ref={rootRef}>
      <span className="local-font-label">中文字体</span>
      <button type="button" className="local-font-trigger" onClick={() => setOpen((current) => !current)}>
        <span style={{ fontFamily: `'${value}', sans-serif` }}>{value}</span>
        <span className={`component-picker-arrow ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="local-font-menu">
          <button type="button" className="local-font-read" onClick={readLocalFonts}>读取本机字体</button>
          {status && <div className="local-font-status">{status}</div>}
          <div className="local-font-list">
            {fonts.map((font) => (
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
          </div>
        </div>
      )}
    </div>
  );
}
