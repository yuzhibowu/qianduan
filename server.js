import express from "express"
import { spawn } from "node:child_process"
import { mkdir, readFile, rm } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { chromium } from "playwright-core"
import { PNG } from "pngjs"

const app = express()
const port = 5173
const projectRoot = resolve(import.meta.dirname)
const artifactsRoot = resolve(projectRoot, "artifacts", "exports")
const defaultLoopDuration = Math.PI * 2 / 0.6
const browserCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
]

let job = { running: false, stage: "准备就绪", frame: 0, totalFrames: 0, progress: 0, outputPath: "", framesPath: "", error: "" }
let activeAbortController = null
let activeChild = null

app.use(express.json({ limit: "32kb" }))
app.use(express.static(resolve(projectRoot, "dist")))

function run(command, args, signal) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] })
    activeChild = child
    let stdout = "", stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    const abort = () => child.kill("SIGTERM")
    signal?.addEventListener("abort", abort, { once: true })
    child.on("error", reject)
    child.on("close", (code) => {
      if (activeChild === child) activeChild = null
      signal?.removeEventListener("abort", abort)
      if (signal?.aborted) reject(new DOMException("导出已取消", "AbortError"))
      else if (code === 0) resolveRun({ stdout, stderr })
      else reject(new Error(`${command} 退出码 ${code}: ${stderr.slice(-1200)}`))
    })
  })
}

async function findBrowser() {
  for (const candidate of browserCandidates) {
    try { await readFile(candidate); return candidate } catch { /* try next */ }
  }
  throw new Error("未找到 Chrome、Edge 或 Chromium")
}

function alphaCounts(buffer) {
  const png = PNG.sync.read(buffer)
  let transparent = 0, partial = 0, opaque = 0
  for (let index = 3; index < png.data.length; index += 4) {
    if (png.data[index] === 0) transparent += 1
    else if (png.data[index] === 255) opaque += 1
    else partial += 1
  }
  return { transparent, partial, opaque }
}

function normalizedSettings(input) {
  const number = (key, fallback, min, max) => Math.min(max, Math.max(min, Number(input[key] ?? fallback)))
  const width = Math.round(number("width", 1920, 16, 8192))
  const height = Math.round(number("height", 1080, 16, 8192))
  const fps = [30, 60].includes(Number(input.fps)) ? Number(input.fps) : 60
  const duration = number("duration", defaultLoopDuration, 0.1, 60)
  const delay = number("delay", 0, 0, 30)
  const totalFrames = Math.round(fps * (duration + delay))
  if (width * height > 33_554_432 || totalFrames > 3600) throw new Error("导出规格超过当前安全上限")
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  const background = input.background === "transparent" ? "transparent" : color(input.background, "transparent")
  return {
    width, height, fps, duration, delay, totalFrames, background,
    baseColor: color(input.baseColor, "#FFFFFF"), accentColor: color(input.accentColor, "#FFFFFF"),
    speed: number("speed", 100, 0, 200), ringSpeed: number("ringSpeed", 50, 0, 100),
    distance: number("distance", 20, 0.5, 80), count: Math.round(number("count", 8, 1, 16)),
    coinSize: number("coinSize", 100, 20, 180), spread: number("spread", 100, 30, 180),
    keepFrames: input.keepFrames === true,
    format: input.format === "apng" ? "apng" : "mov",
    pngCompression: input.pngCompression !== false,
  }
}

async function exportMovie(settings, signal) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const frameDirectory = resolve(artifactsRoot, `frames-${stamp}`)
  const isApng = settings.format === "apng"
  const outputPath = resolve(homedir(), "Desktop", `OriginKit-Coin-Loader-${stamp}.${isApng ? "png" : "mov"}`)
  await mkdir(frameDirectory, { recursive: true })
  let browser
  try {
    job = { ...job, stage: "Rendering Frames" }
    browser = await chromium.launch({ executablePath: await findBrowser(), headless: true })
    const page = await browser.newPage({ viewport: { width: settings.width, height: settings.height }, deviceScaleFactor: 1 })
    const params = new URLSearchParams({
      render: "frame", time: "0", width: String(settings.width), height: String(settings.height), duration: String(settings.duration),
      background: settings.background, baseColor: settings.baseColor, accentColor: settings.accentColor,
      speed: String(settings.speed), ringSpeed: String(settings.ringSpeed), distance: String(settings.distance),
      count: String(settings.count), coinSize: String(settings.coinSize), spread: String(settings.spread),
    })
    await page.goto(`http://127.0.0.1:${port}/?${params}`, { waitUntil: "networkidle" })
    await page.waitForFunction(() => typeof window.__originKitRenderAt === "function")
    for (let index = 0; index < settings.totalFrames; index += 1) {
      if (signal.aborted) throw new DOMException("导出已取消", "AbortError")
      const time = Math.max(0, index / settings.fps - settings.delay)
      await page.evaluate((absoluteTime) => window.__originKitRenderAt?.(absoluteTime), time)
      await page.screenshot({ path: resolve(frameDirectory, `frame-${String(index).padStart(5, "0")}.png`), omitBackground: settings.background === "transparent" })
      job = { ...job, frame: index + 1, progress: (index + 1) / settings.totalFrames * 90 }
    }
    await browser.close(); browser = undefined

    job = { ...job, stage: isApng ? "Encoding APNG" : "Encoding ProRes", progress: 92 }
    const inputArgs = ["-y", "-v", "error", "-framerate", String(settings.fps), "-start_number", "0", "-i", resolve(frameDirectory, "frame-%05d.png")]
    const encodeArgs = isApng
      ? ["-c:v", "apng", "-pix_fmt", "rgba", "-plays", "0", "-pred", settings.pngCompression ? "mixed" : "none", "-f", "apng", outputPath]
      : ["-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-vendor", "apl0", outputPath]
    await run("ffmpeg", [...inputArgs, ...encodeArgs], signal)
    job = { ...job, stage: isApng ? "验证 PNG 动图" : "验证视频", progress: 97 }
    if (isApng && settings.background === "transparent") {
      const decodedFrame = resolve(frameDirectory, "apng-alpha-verify.png")
      await run("ffmpeg", ["-y", "-v", "error", "-i", outputPath, "-frames:v", "1", decodedFrame], signal)
      const alpha = alphaCounts(await readFile(decodedFrame))
      if (alpha.transparent === 0 || alpha.opaque === 0) throw new Error("PNG 动图透明通道验证失败")
    }
    const result = await run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,nb_read_frames,duration", "-of", "json", outputPath], signal)
    const stream = JSON.parse(result.stdout).streams?.[0]
    const validCodec = isApng ? stream?.codec_name === "apng" && stream?.pix_fmt === "rgba" : stream?.codec_name === "prores" && stream?.profile === "4444" && stream?.pix_fmt.startsWith("yuva444p")
    if (!stream || !validCodec || Number(stream.nb_read_frames) !== settings.totalFrames) throw new Error(isApng ? "PNG 动图文件验证失败" : "ProRes 4444 文件验证失败")
    job = { ...job, running: false, stage: "Finished", progress: 100, outputPath, framesPath: settings.keepFrames ? frameDirectory : "" }
  } catch (error) {
    const cancelled = signal.aborted || (error instanceof DOMException && error.name === "AbortError")
    job = { ...job, running: false, stage: cancelled ? "已取消" : "导出失败", error: cancelled ? "" : error instanceof Error ? error.message : String(error) }
  } finally {
    await browser?.close().catch(() => {})
    if (!settings.keepFrames || signal.aborted) await rm(frameDirectory, { recursive: true, force: true })
    activeAbortController = null
  }
}

app.post("/api/export", (request, response) => {
  if (job.running) return response.status(409).send("已有导出任务正在运行")
  try {
    const settings = normalizedSettings(request.body)
    job = { running: true, stage: "准备导出", frame: 0, totalFrames: settings.totalFrames, progress: 0, outputPath: "", framesPath: "", error: "" }
    activeAbortController = new AbortController()
    void exportMovie(settings, activeAbortController.signal)
    response.status(202).json({ accepted: true })
  } catch (error) {
    response.status(400).send(error instanceof Error ? error.message : String(error))
  }
})

app.get("/api/export/status", (_request, response) => response.json(job))
app.post("/api/export/cancel", (_request, response) => {
  if (!job.running || !activeAbortController) return response.status(409).send("当前没有正在运行的导出任务")
  activeAbortController.abort()
  activeChild?.kill("SIGTERM")
  response.json({ cancelling: true })
})
app.post("/api/export-usdz", async (request, response) => {
  if (job.running) return response.status(409).send("请先等待当前 MOV 导出完成")
  try {
    const settings = normalizedSettings(request.body)
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const outputPath = resolve(homedir(), "Desktop", `OriginKit-Coin-Loader-${stamp}.usdz`)
    await run(process.execPath, ["scripts/export-coin-usdz.mjs", outputPath, "--duration", String(settings.duration), "--delay", String(settings.delay), "--fps", String(settings.fps), "--speed", String(settings.speed), "--ring-speed", String(settings.ringSpeed), "--count", String(settings.count), "--coin-size", String(settings.coinSize), "--spread", String(settings.spread), "--base-color", settings.baseColor])
    await run("/usr/bin/usdchecker", [outputPath])
    response.json({ outputPath, duration: settings.duration, totalDuration: settings.duration + settings.delay, fps: settings.fps, samples: Math.max(1, Math.round((settings.duration + settings.delay) * settings.fps)), format: "USDZ", animation: true })
  } catch (error) {
    response.status(500).send(error instanceof Error ? error.message : String(error))
  }
})
app.post("/api/reveal", async (request, response) => {
  const requestedPath = typeof request.body?.path === "string" ? resolve(request.body.path) : job.outputPath
  const desktopRoot = resolve(homedir(), "Desktop") + "/"
  if (!requestedPath || !requestedPath.startsWith(desktopRoot)) return response.status(404).send("没有可显示的导出文件")
  await run("open", ["-R", requestedPath])
  response.json({ ok: true })
})

app.listen(port, "127.0.0.1", () => console.log(`OriginKit Motion Exporter: http://127.0.0.1:${port}`))
