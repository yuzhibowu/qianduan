import { spawn } from "node:child_process"
import { mkdir, readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { PNG } from "pngjs"
import { chromium } from "playwright-core"

const projectRoot = resolve(import.meta.dirname, "..")
const outputPath = resolve(process.argv[2] ?? "artifacts/coin-loader-alpha.png")
const width = 1920
const height = 1080
const time = 1
const port = 4173

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

function inspectAlpha(buffer) {
  const png = PNG.sync.read(buffer)
  let transparent = 0
  let opaque = 0
  let partial = 0
  for (let index = 3; index < png.data.length; index += 4) {
    const alpha = png.data[index]
    if (alpha === 0) transparent += 1
    else if (alpha === 255) opaque += 1
    else partial += 1
  }
  return { width: png.width, height: png.height, transparent, partial, opaque }
}

await mkdir(dirname(outputPath), { recursive: true })
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "pipe"],
})

let browser
try {
  await waitForServer(`http://127.0.0.1:${port}`)
  browser = await chromium.launch({ executablePath: await findBrowser(), headless: true })
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${port}/?render=frame&time=${time}&width=${width}&height=${height}`, { waitUntil: "networkidle" })
  const canvas = page.getByTestId("coin-loader-canvas")
  await canvas.waitFor({ state: "visible" })
  await page.waitForFunction(() => document.querySelector("canvas")?.dataset.renderedTime === "1.000000")
  const buffer = await page.screenshot({ path: outputPath, omitBackground: true })
  const alpha = inspectAlpha(buffer)
  if (alpha.width !== width || alpha.height !== height) throw new Error(`PNG 尺寸错误：${alpha.width}×${alpha.height}`)
  if (alpha.transparent === 0) throw new Error("PNG 没有透明像素")
  if (alpha.opaque === 0) throw new Error("PNG 没有 Coin Loader 的不透明内容")
  console.log(JSON.stringify({ outputPath, time, ...alpha }, null, 2))
} finally {
  await browser?.close()
  server.kill("SIGTERM")
}
