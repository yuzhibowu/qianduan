import { useEffect, useMemo, useRef, useState } from "react"
import CoinLoader from "./components/CoinLoader"
import Slider from "./components/Slider"
import { DEFAULT_LOOP_DURATION, rotationsPerCycle } from "./time"
import { buildCoinUsdz, downloadUsdz } from "./usdz"

export default function App() {
  const query = new URLSearchParams(window.location.search)
  const exportMode = query.get("render") === "frame"
  const exportTime = Number(query.get("time") ?? 0)
  const exportWidth = Number(query.get("width") ?? 1920)
  const exportHeight = Number(query.get("height") ?? 1080)
  const queryBaseColor = query.get("baseColor") ?? "#FFFFFF"
  const queryAccentColor = query.get("accentColor") ?? "#FFFFFF"
  const querySpeed = Number(query.get("speed") ?? 100)
  const queryRingSpeed = Number(query.get("ringSpeed") ?? 50)
  const queryDistance = Number(query.get("distance") ?? 20)
  const queryCount = Number(query.get("count") ?? 8)
  const queryCoinSize = Number(query.get("coinSize") ?? 100)
  const querySpread = Number(query.get("spread") ?? 100)
  const queryBackground = query.get("background") ?? "transparent"
  const queryDuration = Number(query.get("duration") ?? DEFAULT_LOOP_DURATION)
  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(0)
  const [speed, setSpeed] = useState(100)
  const [ringSpeed, setRingSpeed] = useState(50)
  const [baseColor, setBaseColor] = useState("#FFFFFF")
  const [accentColor, setAccentColor] = useState("#FFFFFF")
  const [distance, setDistance] = useState(20)
  const [count, setCount] = useState(8)
  const [coinSize, setCoinSize] = useState(100)
  const [spread, setSpread] = useState(100)
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(1080)
  const [fps, setFps] = useState(30)
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "1:1">("16:9")
  const [duration, setDuration] = useState(DEFAULT_LOOP_DURATION)
  const [delay, setDelay] = useState(0)
  const [background, setBackground] = useState("transparent")
  const [loop, setLoop] = useState(true)
  const [keepFrames, setKeepFrames] = useState(false)
  const [pngCompression, setPngCompression] = useState(true)
  const [colorCorrection, setColorCorrection] = useState(false)
  const [colorTarget, setColorTarget] = useState<"keynote" | "freeform">("keynote")
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const [job, setJob] = useState({ running: false, stage: "准备就绪", frame: 0, totalFrames: 0, progress: 0, outputPath: "", framesPath: "", error: "" })
  const [usdzJob, setUsdzJob] = useState({ running: false, outputPath: "", summary: "", error: "" })
  const originRef = useRef(0)
  const timeAtPlayRef = useRef(0)
  const previewRef = useRef<HTMLDivElement>(null)

  if (exportMode) {
    document.documentElement.dataset.render = "frame"
    return <div
      data-testid="export-stage"
      style={{ width: exportWidth, height: exportHeight, position: "fixed", inset: 0, background: "transparent" }}
    >
      <CoinLoader
        baseColor={queryBaseColor}
        accentColor={queryAccentColor}
        speed={querySpeed}
        distance={queryDistance}
        coins={{ count: queryCount, coinSize: queryCoinSize, spread: querySpread, ringSpeed: queryRingSpeed }}
        timeSeconds={Number.isFinite(exportTime) ? exportTime : 0}
        loopDuration={queryDuration}
        background={queryBackground}
      />
    </div>
  }

  const frameTotal = Math.round(fps * (duration + delay))
  const rotationRate = DEFAULT_LOOP_DURATION / Math.max(0.1, duration)
  const previewTime = loop && duration > 0 ? time % duration : Math.min(time, duration)
  const previewBackground = background === "transparent" ? "transparent" : background
  const compensateHex = (hex: string) => {
    if (!colorCorrection || colorTarget !== "keynote") return hex
    const n = Number.parseInt(hex.slice(1), 16)
    const input = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    const m = [[1.22669, -0.39172, -0.03628], [-0.00928, 0.82096, 0.06438], [-0.07821, -0.15223, 1.07124]]
    const o = [0.06313, 0.12467, 0.00493]
    const out = input.map((v, i) => Math.max(0, Math.min(255, Math.round((m[i][0] * v / 255 + m[i][1] * input[1] / 255 + m[i][2] * input[2] / 255 + o[i]) * 255))))
    return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`
  }
  const exportPayload = useMemo(() => ({ width, height, fps, duration, delay, background, baseColor, accentColor, speed, ringSpeed, distance, count, coinSize, spread, keepFrames, pngCompression }), [width, height, fps, duration, delay, background, baseColor, accentColor, speed, ringSpeed, distance, count, coinSize, spread, keepFrames, pngCompression])
  const usdzPayload = useMemo(() => ({ ...exportPayload, baseColor: compensateHex(baseColor), accentColor: compensateHex(accentColor) }), [exportPayload, baseColor, accentColor, colorCorrection, colorTarget])

  async function startExport(format: "mov" | "apng") {
    setJob((current) => ({ ...current, running: true, stage: "准备导出", frame: 0, totalFrames: frameTotal, progress: 0, outputPath: "", framesPath: "", error: "" }))
    const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...exportPayload, format }) })
    if (!response.ok) {
      const message = await response.text()
      setJob((current) => ({ ...current, running: false, stage: "导出失败", error: message }))
      return
    }
    const timer = window.setInterval(async () => {
      const status = await fetch("/api/export/status").then((result) => result.json())
      setJob(status)
      if (!status.running) window.clearInterval(timer)
    }, 250)
  }

  async function revealOutput(path?: string) {
    await fetch("/api/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(path ? { path } : {}) })
  }

  async function exportUsdz() {
    setUsdzJob({ running: true, outputPath: "", summary: "正在浏览器中生成动画 USDZ…", error: "" })
    try {
      await new Promise((resolve) => setTimeout(resolve, 20))
      const result = buildCoinUsdz(usdzPayload)
      downloadUsdz(result.bytes, `OriginKit-Coin-Loader-${Date.now()}.usdz`)
      setUsdzJob({ running: false, outputPath: "", summary: `已下载 · 完整循环 ${duration.toFixed(3)} 秒 · ${fps} FPS · ${result.frames} 个确定性采样`, error: "" })
    } catch (error) {
      setUsdzJob({ running: false, outputPath: "", summary: "", error: error instanceof Error ? error.message : String(error) })
    }
  }

  async function cancelExport() {
    await fetch("/api/export/cancel", { method: "POST" })
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    const zoom = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      setDistance((value) => Math.min(80, Math.max(0.5, value + event.deltaY * 0.015)))
    }
    preview.addEventListener("wheel", zoom, { passive: false })
    return () => preview.removeEventListener("wheel", zoom)
  }, [])

  useEffect(() => {
    if (!playing) return
    originRef.current = performance.now()
    timeAtPlayRef.current = time
    let raf = 0
    const tick = (now: number) => {
      const nextTime = timeAtPlayRef.current + (now - originRef.current) / 1000
      setTime(nextTime)
      if (!loop && nextTime >= duration) { setPlaying(false); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, loop, duration])

  const boundedRotationRate = Math.min(3, Math.max(0.5, rotationRate))
  const setRatio = (ratio: "16:9" | "1:1") => {
    setAspectRatio(ratio)
    setHeight(ratio === "1:1" ? width : Math.round(width * 9 / 16))
  }
  const setResolution = (wide: number, tall: number) => {
    setWidth(aspectRatio === "1:1" ? tall : wide)
    setHeight(tall)
  }
  return <main className="app">
    <section className="stage">
      <header className="titlebar"><strong className="tool-name">OriginKit → Keynote Motion Exporter</strong><div className="title-actions"><span className="version">260908X5</span><button className="theme-toggle" aria-label={theme === "light" ? "切换到暗色外观" : "切换到亮色外观"} onClick={() => setTheme((value) => value === "light" ? "dark" : "light")}>{theme === "light" ? "☀" : "☾"}</button></div></header>
      <div className="checkerboard" ref={previewRef}><div className={`canvas-stage ${aspectRatio === "1:1" ? "square" : ""}`} style={{ aspectRatio: aspectRatio === "1:1" ? "1 / 1" : "16 / 9" }} data-testid="render-stage"><CoinLoader background={previewBackground} baseColor={baseColor} accentColor={accentColor} speed={speed} distance={distance} coins={{ count, coinSize, spread, ringSpeed }} timeSeconds={previewTime} loopDuration={duration} /></div></div>
      <div className="stage-dock"><span>Coin Loader · 双指上下滑动缩放</span><div className="stage-tools"><button className="btn" onClick={() => setPlaying((value) => !value)}>{playing ? "暂停" : "播放"}</button><button className="btn" onClick={() => { setPlaying(false); setTime(0) }}>回到开头</button></div></div>
    </section>
    <aside className="side">
      <div className="side-head"><select className="model-type" aria-label="组件"><option>Coin Loader</option></select><strong className="brand">饼饼SHOW</strong></div>
      <div className="side-body">
        <section><h2>组件参数</h2><div className="color-row"><label className="field">主体颜色<input aria-label="主体颜色" type="color" value={baseColor} onChange={(event) => setBaseColor(event.target.value)} /></label><label className="field">高光颜色<input aria-label="高光颜色" type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} /></label></div>
          <Slider label="硬币翻转" value={speed} min={0} max={200} step={50} display={`${rotationsPerCycle(speed)} 圈 / 周期`} onChange={setSpeed} />
          <Slider label="圆环旋转" value={ringSpeed} min={0} max={100} step={50} display={`${rotationsPerCycle(ringSpeed)} 圈 / 周期`} onChange={setRingSpeed} />
          <Slider label="整体旋转速度" value={boundedRotationRate} min={0.5} max={3} step={0.01} display={`${boundedRotationRate.toFixed(2)}×`} onChange={(value) => setDuration(DEFAULT_LOOP_DURATION / value)} snaps={[{ value: .5, label: ".5×" }, { value: 1, label: "1×" }, { value: 1.5, label: "1.5×" }, { value: 2, label: "2×" }, { value: 2.5, label: "2.5×" }, { value: 3, label: "3×" }]} />
          <Slider label="硬币数量" value={count} min={1} max={16} display={String(count)} onChange={setCount} />
          <Slider label="硬币大小" value={coinSize} min={20} max={180} display={`${coinSize}%`} onChange={setCoinSize} />
          <Slider label="圆环范围" value={spread} min={30} max={180} display={`${spread}%`} onChange={setSpread} />
          <Slider label="镜头距离" value={distance} min={0.5} max={80} step={0.1} display={distance.toFixed(1)} onChange={setDistance} />
        </section>
        <section><h2>时间验证</h2><Slider label="绝对时间" value={previewTime} min={0} max={duration} step={0.001} display={`${previewTime.toFixed(3)} 秒`} onChange={(value) => { setPlaying(false); setTime(value) }} /><label className="check-row"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />循环预览</label></section>
        <section><h2>导出参数</h2><div className="opts"><button className={`opt ${aspectRatio === "16:9" ? "active" : ""}`} onClick={() => setRatio("16:9")}>16:9</button><button className={`opt ${aspectRatio === "1:1" ? "active" : ""}`} onClick={() => setRatio("1:1")}>1:1</button></div><div className="opts four"><button className={`opt ${width === (aspectRatio === "1:1" ? 720 : 1280) ? "active" : ""}`} onClick={() => setResolution(1280, 720)}>720P</button><button className={`opt ${width === (aspectRatio === "1:1" ? 1080 : 1920) ? "active" : ""}`} onClick={() => setResolution(1920, 1080)}>1080P</button><button className={`opt ${width === (aspectRatio === "1:1" ? 1440 : 2560) ? "active" : ""}`} onClick={() => setResolution(2560, 1440)}>2K</button><button className={`opt ${width === (aspectRatio === "1:1" ? 2160 : 3840) ? "active" : ""}`} onClick={() => setResolution(3840, 2160)}>4K</button></div><div className="field-row"><label className="field">宽度<input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label className="field">高度<input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label></div><div className="opts"><button className={`opt ${fps === 30 ? "active" : ""}`} onClick={() => setFps(30)}>30 FPS</button><button className={`opt ${fps === 60 ? "active" : ""}`} onClick={() => setFps(60)}>60 FPS</button></div><div className="field-row"><label className="field">完整周期<input type="number" min="0.1" step="0.01" value={Number(duration.toFixed(3))} onChange={(event) => setDuration(Number(event.target.value))} /></label><label className="field">开始延迟<input type="number" min="0" step="0.1" value={delay} onChange={(event) => setDelay(Number(event.target.value))} /></label></div><div className="opts four"><button className={`opt ${background === "transparent" ? "active" : ""}`} onClick={() => setBackground("transparent")}>透明</button><button className={`opt ${background === "#000000" ? "active" : ""}`} onClick={() => setBackground("#000000")}>黑色</button><button className={`opt ${background === "#FFFFFF" ? "active" : ""}`} onClick={() => setBackground("#FFFFFF")}>白色</button><input aria-label="背景颜色" type="color" value={background === "transparent" ? "#4A90E2" : background} onChange={(event) => setBackground(event.target.value)} /></div><label className="check-row"><input type="checkbox" checked={keepFrames} onChange={(event) => setKeepFrames(event.target.checked)} />保留透明 PNG 序列</label></section>
        <section className="export-block"><button className="btn-primary mov" disabled={job.running} onClick={() => startExport("mov")}>{job.running ? "正在导出…" : "导出透明 MOV"}</button><button className="btn-primary apng" disabled={job.running} onClick={() => startExport("apng")}>{job.running ? "正在导出…" : "导出 PNG 动图"}</button><label className="check-row"><input type="checkbox" checked={pngCompression} onChange={(event) => setPngCompression(event.target.checked)} />无损压缩 PNG 动图</label>{job.running && <button className="btn cancel" onClick={cancelExport}>取消导出</button>}<div className="progress"><span style={{ width: `${job.progress}%` }} /></div><p className="status">{job.stage}{job.totalFrames > 0 ? ` · ${job.frame} / ${job.totalFrames} · ${Math.round(job.progress)}%` : ""}</p>{job.error && <p className="error">{job.error}</p>}{job.outputPath && <><p className="path">{job.outputPath}</p><button className="btn" onClick={() => revealOutput()}>在 Finder 中显示</button></>}<div className="format-divider"><span>Keynote 原生 3D</span></div><button className="btn-primary" disabled={job.running || usdzJob.running} onClick={exportUsdz}>{usdzJob.running ? "正在生成 USDZ…" : "导出动画 USDZ"}</button><label className="check-row"><input type="checkbox" checked={colorCorrection} onChange={(event) => setColorCorrection(event.target.checked)} />校正颜色</label>{colorCorrection && <div className="opts"><button className={`opt ${colorTarget === "keynote" ? "active" : ""}`} onClick={() => setColorTarget("keynote")}>Keynote</button><button className={`opt ${colorTarget === "freeform" ? "active" : ""}`} onClick={() => setColorTarget("freeform")}>无边记</button></div>}{usdzJob.summary && <p className="status">{usdzJob.summary}</p>}{usdzJob.error && <p className="error">{usdzJob.error}</p>}{usdzJob.outputPath && <><p className="path">{usdzJob.outputPath}</p><button className="btn" onClick={() => revealOutput(usdzJob.outputPath)}>在 Finder 中显示 USDZ</button></>}</section>
      </div>
    </aside>
  </main>
}
