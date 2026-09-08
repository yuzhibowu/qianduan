import { spawn } from "node:child_process"
import { readFile, unlink } from "node:fs/promises"
import { resolve } from "node:path"
import { PNG } from "pngjs"

const projectRoot = resolve(import.meta.dirname, "..")
const framesDirectory = resolve(process.argv[2] ?? "artifacts/coin-loader-frames")
const outputPath = resolve(process.argv[3] ?? "artifacts/coin-loader-prores4444.mov")
const fps = Number(process.env.RENDER_FPS ?? 60)
const expectedFrames = Number(process.env.RENDER_FRAMES ?? 180)
const decodedProbe = resolve("artifacts/.decoded-alpha-probe.png")

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const process = spawn(command, args, { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = "", stderr = ""
    process.stdout.on("data", (chunk) => { stdout += chunk })
    process.stderr.on("data", (chunk) => { stderr += chunk })
    process.on("error", reject)
    process.on("close", (code) => code === 0 ? resolveRun({ stdout, stderr }) : reject(new Error(`${command} 退出码 ${code}\n${stderr}`)))
  })
}

function alphaCounts(buffer) {
  const png = PNG.sync.read(buffer)
  let transparent = 0, partial = 0, opaque = 0
  for (let index = 3; index < png.data.length; index += 4) {
    const alpha = png.data[index]
    if (alpha === 0) transparent += 1
    else if (alpha === 255) opaque += 1
    else partial += 1
  }
  return { width: png.width, height: png.height, transparent, partial, opaque }
}

await run("ffmpeg", [
  "-y", "-v", "error", "-framerate", String(fps), "-start_number", "0",
  "-i", resolve(framesDirectory, "frame-%05d.png"),
  "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le",
  "-alpha_bits", "16", "-vendor", "apl0", outputPath,
])

const probeResult = await run("ffprobe", [
  "-v", "error", "-count_frames", "-select_streams", "v:0",
  "-show_entries", "stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration",
  "-of", "json", outputPath,
])
const probe = JSON.parse(probeResult.stdout).streams?.[0]
if (!probe || probe.codec_name !== "prores" || probe.profile !== "4444") throw new Error("输出不是 ProRes 4444")
if (!String(probe.pix_fmt).startsWith("yuva444p")) throw new Error(`输出像素格式不含 Alpha：${probe.pix_fmt}`)
if (probe.r_frame_rate !== `${fps}/1` || Number(probe.nb_read_frames) !== expectedFrames) throw new Error("输出 FPS 或帧数不正确")
if (Number(probe.duration) !== expectedFrames / fps) throw new Error("输出视频时长不正确")

try {
  await run("ffmpeg", ["-y", "-v", "error", "-i", outputPath, "-frames:v", "1", "-pix_fmt", "rgba", decodedProbe])
  const alpha = alphaCounts(await readFile(decodedProbe))
  if (alpha.transparent === 0 || alpha.opaque === 0) throw new Error("MOV 解码帧没有同时包含透明区域和可见内容")
  console.log(JSON.stringify({ outputPath, ...probe, decodedAlpha: alpha }, null, 2))
} finally {
  await unlink(decodedProbe).catch(() => {})
}
