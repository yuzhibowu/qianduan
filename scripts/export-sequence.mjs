import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { mkdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { chromium } from "playwright-core"

const projectRoot = resolve(import.meta.dirname, "..")
const outputDirectory = resolve(process.argv[2] ?? "artifacts/coin-loader-frames")
const width = Number(process.env.RENDER_WIDTH ?? 1920)
const height = Number(process.env.RENDER_HEIGHT ?? 1080)
const fps = Number(process.env.RENDER_FPS ?? 60)
const duration = Number(process.env.RENDER_DURATION ?? 3)
const startDelay = Number(process.env.RENDER_DELAY ?? 0)
const frameCount = Math.round(fps * duration)
const port = 4174

const browserCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
]

async function findBrowser() {
  for (const candidate of browserCandidates) {
    try { await readFile(candidate); return candidate } catch { /* try next */ }
  }
  throw new Error("未找到可用于逐帧渲染的 Chrome、Edge 或 Chromium")
}

async function waitForServer(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return } catch { /* server is starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  }
  throw new Error("Vite 预览服务启动超时")
}

function frameName(index) {
  return `frame-${String(index).padStart(5, "0")}.png`
}

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex")
}

if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("输出尺寸无效")
if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(duration) || duration <= 0) throw new Error("FPS 或时长无效")
if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error("帧数必须是正整数")

await mkdir(outputDirectory, { recursive: true })
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "pipe"],
})

let browser
try {
  await waitForServer(`http://127.0.0.1:${port}`)
  browser = await chromium.launch({ executablePath: await findBrowser(), headless: true })
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${port}/?render=frame&time=0&width=${width}&height=${height}`, { waitUntil: "networkidle" })
  await page.getByTestId("coin-loader-canvas").waitFor({ state: "visible" })
  await page.waitForFunction(() => typeof window.__originKitRenderAt === "function")

  let verificationFrame
  let verificationTime
  for (let index = 0; index < frameCount; index += 1) {
    const timelineTime = index / fps
    const animationTime = Math.max(0, timelineTime - startDelay)
    await page.evaluate((time) => window.__originKitRenderAt?.(time), animationTime)
    const buffer = await page.screenshot({ path: resolve(outputDirectory, frameName(index)), omitBackground: true })
    if (index === Math.floor(frameCount / 2)) {
      verificationFrame = buffer
      verificationTime = animationTime
    }
    if (index === 0 || (index + 1) % 15 === 0 || index === frameCount - 1) {
      console.log(`Rendering Frames ${index + 1} / ${frameCount} (${Math.round((index + 1) / frameCount * 100)}%)`)
    }
  }

  await page.evaluate((time) => window.__originKitRenderAt?.(time), verificationTime)
  const rerender = await page.screenshot({ omitBackground: true })
  const firstHash = hash(verificationFrame)
  const secondHash = hash(rerender)
  if (firstHash !== secondHash) throw new Error("相同绝对时间重复渲染的 PNG 像素不一致")

  console.log(JSON.stringify({
    outputDirectory, width, height, fps, duration, startDelay, frameCount,
    firstTime: 0,
    lastTime: (frameCount - 1) / fps,
    deterministicFrame: Math.floor(frameCount / 2),
    deterministicSha256: firstHash,
  }, null, 2))
} finally {
  await browser?.close()
  server.kill("SIGTERM")
}
