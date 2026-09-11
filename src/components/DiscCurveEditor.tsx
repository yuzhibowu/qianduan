import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DiscCurvePreset, DiscCurveSettings } from "../disc-curve";

const PRESETS: Array<{ value: DiscCurvePreset; label: string; points: [number, number, number, number] }> = [
  { value: "linear", label: "匀速", points: [0, 0, 1, 1] },
  { value: "ease-in", label: "缓入", points: [0.42, 0, 0.7, 0.7] },
  { value: "ease-out", label: "缓出", points: [0.3, 0.3, 0.58, 1] },
  { value: "ease-in-out", label: "缓入缓出", points: [0.42, 0, 0.58, 1] },
  { value: "custom", label: "自定义", points: [0.25, 0.1, 0.25, 1] },
];
const PLOT_WIDTH = 300;
const PLOT_LEFT = 4;
const PLOT_RIGHT = 296;
const PLOT_TOP = 7;
const PLOT_BOTTOM = 93;

export default function DiscCurveEditor({ value, update }: { value: DiscCurveSettings; update: (value: DiscCurveSettings) => void }) {
  const [open, setOpen] = useState(false);
  const plotRef = useRef<SVGSVGElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!selectRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const selected = PRESETS.find((preset) => preset.value === value.preset) ?? PRESETS[2];
  const setPreset = (preset: typeof PRESETS[number]) => {
    const [x1, y1, x2, y2] = preset.points;
    update({ preset: preset.value, x1, y1, x2, y2 });
    setOpen(false);
  };
  const drag = (first: boolean, event: ReactPointerEvent<SVGCircleElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const rect = plotRef.current?.getBoundingClientRect();
      if (!rect) return;
      const plotX = ((next.clientX - rect.left) / Math.max(1, rect.width)) * PLOT_WIDTH;
      const plotY = ((next.clientY - rect.top) / Math.max(1, rect.height)) * 100;
      const x = Math.min(1, Math.max(0, (plotX - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT)));
      const y = Math.min(1, Math.max(0, (PLOT_BOTTOM - plotY) / (PLOT_BOTTOM - PLOT_TOP)));
      update(first ? { ...value, preset: "custom", x1: x, y1: y } : { ...value, preset: "custom", x2: x, y2: y });
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  };
  const point = (x: number, y: number) => ({
    x: PLOT_LEFT + x * (PLOT_RIGHT - PLOT_LEFT),
    y: PLOT_BOTTOM - y * (PLOT_BOTTOM - PLOT_TOP),
  });
  const p1 = point(value.x1, value.y1);
  const p2 = point(value.x2, value.y2);
  return (
    <div className="disc-curve-editor">
      <div className="disc-curve-title-row">
        <span>动画曲线</span>
        <div className="disc-curve-select" ref={selectRef}>
          <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((shown) => !shown)}>{selected.label}<span className={`disc-curve-arrow ${open ? "open" : ""}`} /></button>
          {open && <div className="disc-curve-menu" role="menu">{PRESETS.map((preset) => <button type="button" className={preset.value === value.preset ? "selected" : ""} role="menuitemradio" aria-checked={preset.value === value.preset} key={preset.value} onClick={() => setPreset(preset)}>{preset.label}</button>)}</div>}
        </div>
      </div>
      <svg ref={plotRef} className="disc-curve-plot" viewBox={`0 0 ${PLOT_WIDTH} 100`} role="img" aria-label="位置曲线坐标轴">
        <path className="disc-curve-guides" d={`M${PLOT_LEFT} ${PLOT_BOTTOM}L${p1.x} ${p1.y}M${PLOT_RIGHT} ${PLOT_TOP}L${p2.x} ${p2.y}`} />
        <path className="disc-curve-line" d={`M${PLOT_LEFT} ${PLOT_BOTTOM}C${p1.x} ${p1.y} ${p2.x} ${p2.y} ${PLOT_RIGHT} ${PLOT_TOP}`} />
        <circle className="disc-curve-handle" cx={p1.x} cy={p1.y} r="4" onPointerDown={(event) => drag(true, event)} />
        <circle className="disc-curve-handle" cx={p2.x} cy={p2.y} r="4" onPointerDown={(event) => drag(false, event)} />
      </svg>
    </div>
  );
}
