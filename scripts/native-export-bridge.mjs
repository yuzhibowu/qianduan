import { spawn, execFile } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, resolve } from "node:path"
import { promisify } from "node:util"
import { randomUUID } from "node:crypto"

const exec = promisify(execFile)
const jobs = new Map()
let capabilityPromise
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

let crcTable
function crc32(parts) {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
  })
  let crc = 0xffffffff
  for (const part of parts) for (const byte of part) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function uint32(value) {
  const buffer = Buffer.allocUnsafe(4)
  buffer.writeUInt32BE(value >>> 0)
  return buffer
}

function uint16(value) {
  const buffer = Buffer.allocUnsafe(2)
  buffer.writeUInt16BE(value)
  return buffer
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii")
  return Buffer.concat([uint32(data.length), name, data, uint32(crc32([name, data]))])
}

function inspectPng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("帧不是有效 PNG")
  const ancillary = []
  const imageData = []
  let ihdr
  let reachedImage = false
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii")
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") ihdr = data
    else if (type === "IDAT") { reachedImage = true; imageData.push(data) }
    else if (type !== "IEND" && !reachedImage) ancillary.push({ type, data })
    offset += length + 12
  }
  if (!ihdr || imageData.length === 0) throw new Error("PNG 帧缺少图像数据")
  return { ihdr, ancillary, imageData }
}

async function writeStream(stream, bytes) {
  if (!stream.write(bytes)) await new Promise((resolveDrain) => stream.once("drain", resolveDrain))
}

async function appendFullFrameApng(job, frame) {
  if (job.frames >= job.expectedFrames) throw new Error("PNG 动图帧数超出预期")
  const parsed = inspectPng(frame)
  const width = parsed.ihdr.readUInt32BE(0)
  const height = parsed.ihdr.readUInt32BE(4)
  if (job.frames === 0) {
    job.width = width
    job.height = height
    await writeStream(job.writer, pngChunk("IHDR", parsed.ihdr))
    for (const { type, data } of parsed.ancillary) await writeStream(job.writer, pngChunk(type, data))
    await writeStream(job.writer, pngChunk("acTL", Buffer.concat([uint32(job.expectedFrames), uint32(0)])))
  } else if (width !== job.width || height !== job.height) {
    throw new Error("PNG 动图的每帧尺寸必须一致")
  }
  const control = Buffer.concat([
    uint32(job.sequence++), uint32(width), uint32(height), uint32(0), uint32(0),
    uint16(1), uint16(job.fps), Buffer.from([0, 0]),
  ])
  await writeStream(job.writer, pngChunk("fcTL", control))
  if (job.frames === 0) {
    for (const data of parsed.imageData) await writeStream(job.writer, pngChunk("IDAT", data))
  } else {
    for (const data of parsed.imageData) await writeStream(job.writer, pngChunk("fdAT", Buffer.concat([uint32(job.sequence++), data])))
  }
}

function json(response, status, value) {
  response.statusCode = status
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(value))
}

function safeOutputName(value, format) {
  const extension = format === "apng" ? ".png" : ".mov"
  const name = basename(typeof value === "string" ? value : `export${extension}`)
  return name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`
}

async function capabilities() {
  capabilityPromise ??= Promise.all([
    exec("ffmpeg", ["-hide_banner", "-version"]),
    exec("ffmpeg", ["-hide_banner", "-encoders"]),
  ]).then(([version, encoders]) => ({
    available: true,
    ffmpegVersion: version.stdout.split("\n")[0] || "ffmpeg",
    prores4444: encoders.stdout.includes("prores_ks"),
    nativeApng: true,
  })).catch(() => ({ available: true, prores4444: false, nativeApng: true }))
  return capabilityPromise
}

async function bodyBuffer(request, limit = 128 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error("单帧数据超过本机助手安全上限")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function bodyJson(request) {
  const body = await bodyBuffer(request, 64 * 1024)
  return JSON.parse(body.toString("utf8") || "{}")
}

function waitForExit(child) {
  return new Promise((resolveExit, reject) => {
    let stderr = ""
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.once("error", reject)
    child.once("close", (code) => {
      if (code === 0) resolveExit()
      else reject(new Error(`本机 FFmpeg 编码失败（${code}）：${stderr.slice(-1200)}`))
    })
  })
}

async function removeJob(job) {
  jobs.delete(job.id)
  await rm(job.directory, { recursive: true, force: true }).catch(() => {})
}

export function nativeExportBridge() {
  return async function handleNativeExport(request, response, next) {
    const url = new URL(request.url || "/", "http://127.0.0.1")
    if (!url.pathname.startsWith("/__native-export/")) return next()
    try {
      if (request.method === "GET" && url.pathname === "/__native-export/capabilities") {
        return json(response, 200, await capabilities())
      }
      if (request.method === "POST" && url.pathname === "/__native-export/start") {
        const support = await capabilities()
        const input = await bodyJson(request)
        const format = input.format === "apng" ? "apng" : "mov"
        if (!support.available || (format === "mov" && !support.prores4444)) {
          return json(response, 503, { error: "未找到支持 ProRes 4444 的本机 FFmpeg" })
        }
        const fps = Number(input.fps)
        if (![24, 25, 30, 50, 60].includes(fps)) return json(response, 400, { error: "不支持的帧率" })
        const expectedFrames = Math.round(Number(input.totalFrames))
        if (expectedFrames < 1 || expectedFrames > 3600) return json(response, 400, { error: "PNG 动图帧数超出安全范围" })
        const id = randomUUID()
        const directory = await mkdtemp(resolve(tmpdir(), "origin-kit-native-export-"))
        const outputName = safeOutputName(input.outputName, format)
        const outputPath = resolve(directory, outputName)
        let job
        if (format === "apng") {
          const writer = createWriteStream(outputPath)
          const finished = new Promise((resolveFinish, reject) => {
            writer.once("finish", resolveFinish)
            writer.once("error", reject)
          })
          void finished.catch(() => {})
          await writeStream(writer, PNG_SIGNATURE)
          job = { id, directory, outputName, outputPath, format, writer, finished, expectedFrames, fps, frames: 0, sequence: 0, width: 0, height: 0 }
        } else {
          const child = spawn("ffmpeg", [
            "-y", "-v", "error",
            "-f", "image2pipe", "-framerate", String(fps), "-i", "pipe:0",
            "-c:v", "prores_ks", "-profile:v", "5", "-bits_per_mb", "8000",
            "-pix_fmt", "yuva444p10le", "-alpha_bits", "16", "-vendor", "apl0", outputPath,
          ], { stdio: ["pipe", "ignore", "pipe"] })
          const exit = waitForExit(child)
          void exit.catch(() => {})
          job = { id, directory, outputName, outputPath, format, child, frames: 0, exit }
        }
        jobs.set(id, job)
        return json(response, 201, { id, outputName })
      }
      const frameMatch = url.pathname.match(/^\/__native-export\/frame\/([^/]+)$/)
      if (request.method === "POST" && frameMatch) {
        const job = jobs.get(frameMatch[1])
        if (!job) return json(response, 404, { error: "本机导出任务不存在" })
        const frame = await bodyBuffer(request)
        if (job.format === "apng") await appendFullFrameApng(job, frame)
        else if (!job.child.stdin.write(frame)) await new Promise((resolveDrain) => job.child.stdin.once("drain", resolveDrain))
        job.frames += 1
        return json(response, 200, { frame: job.frames })
      }
      const finishMatch = url.pathname.match(/^\/__native-export\/finish\/([^/]+)$/)
      if (request.method === "POST" && finishMatch) {
        const job = jobs.get(finishMatch[1])
        if (!job) return json(response, 404, { error: "本机导出任务不存在" })
        if (job.format === "apng") {
          if (job.frames !== job.expectedFrames) return json(response, 400, { error: `PNG 动图缺少帧：${job.frames}/${job.expectedFrames}` })
          await writeStream(job.writer, pngChunk("IEND", Buffer.alloc(0)))
          job.writer.end()
          await job.finished
        } else {
          job.child.stdin.end()
          await job.exit
        }
        return json(response, 200, {
          outputName: job.outputName,
          downloadUrl: `/__native-export/download/${job.id}`,
        })
      }
      const downloadMatch = url.pathname.match(/^\/__native-export\/download\/([^/]+)$/)
      if (request.method === "GET" && downloadMatch) {
        const job = jobs.get(downloadMatch[1])
        if (!job) return json(response, 404, { error: "本机导出文件不存在" })
        const file = await stat(job.outputPath)
        response.statusCode = 200
        response.setHeader("Content-Type", job.format === "apng" ? "image/png" : "video/quicktime")
        response.setHeader("Content-Length", String(file.size))
        response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(job.outputName)}`)
        const stream = createReadStream(job.outputPath)
        stream.pipe(response)
        response.once("close", () => { void removeJob(job) })
        return
      }
      const cancelMatch = url.pathname.match(/^\/__native-export\/cancel\/([^/]+)$/)
      if (request.method === "POST" && cancelMatch) {
        const job = jobs.get(cancelMatch[1])
        if (!job) return json(response, 200, { cancelled: false })
        if (job.format === "apng") job.writer.destroy()
        else { job.child.stdin.destroy(); job.child.kill("SIGTERM") }
        await removeJob(job)
        return json(response, 200, { cancelled: true })
      }
      return json(response, 404, { error: "未知的本机导出助手请求" })
    } catch (error) {
      return json(response, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}
