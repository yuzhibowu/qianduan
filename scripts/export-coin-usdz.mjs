import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { strToU8, zipSync } from "fflate"

const cliArgs = process.argv.slice(2)
const option = (name, fallback) => {
  const index = cliArgs.indexOf(name)
  return index >= 0 ? cliArgs[index + 1] : fallback
}
const positional = cliArgs.find((value, index) => !value.startsWith("--") && (index === 0 || !cliArgs[index - 1].startsWith("--")))
const duration = Math.max(0, Number(option("--duration", "0")))
const delay = Math.max(0, Number(option("--delay", "0")))
const fps = Math.max(1, Math.round(Number(option("--fps", "60"))))
const speed = Number(option("--speed", "100"))
const ringSpeed = Number(option("--ring-speed", "50"))
const count = Math.max(1, Math.min(16, Math.round(Number(option("--count", "8")))))
const coinSize = Math.max(0.2, Math.min(1.8, Number(option("--coin-size", "100")) / 100))
const spread = Math.max(0.3, Math.min(1.8, Number(option("--spread", "100")) / 100))
const color = (hex, fallback) => /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback
const rgb = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}
const baseColor = rgb(color(option("--base-color", "#B8BDC7"), "#B8BDC7"))
const outputPath = resolve(positional ?? (duration > 0 ? "artifacts/coin-loader-animated.usdz" : "artifacts/coin-loader-static.usdz"))
const TAU = Math.PI * 2
const timelineFrameCount = Math.max(1, Math.round((duration + delay) * fps))
const timelineEndTimeCode = timelineFrameCount - 1

function samples(sampleValue) {
  // A seamless loop contains N unique poses. Do not append pose N: it is the
  // same pose as frame 0 and Apple players display it as an extra hold frame.
  return `{${Array.from({ length: timelineFrameCount }, (_, frame) => `${frame}: ${sampleValue(frame / fps)}`).join(",")}}`
}


const rotationsPerCycle = (value) => value <= 0 ? 0 : Math.max(1, Math.round(value / 50))
const cycleDegrees = (time, value) => {
  const motionTime = Math.max(0, time - delay)
  return duration > 0 ? motionTime / duration * 360 * rotationsPerCycle(value) : 0
}
function matrix4(x, y, z, tx, ty, scale = 1) {
  const rx = x * Math.PI / 180, ry = y * Math.PI / 180, rz = z * Math.PI / 180
  const sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry), sz = Math.sin(rz), cz = Math.cos(rz)
  return `(( ${(cy * cz) * scale}, ${(cy * sz) * scale}, ${(-sy) * scale}, 0), ( ${(sx * sy * cz - cx * sz) * scale}, ${(sx * sy * sz + cx * cz) * scale}, ${(sx * cy) * scale}, 0), ( ${(cx * sy * cz + sx * sz) * scale}, ${(cx * sy * sz - sx * cz) * scale}, ${(cx * cy) * scale}, 0), ( ${tx}, ${ty}, 0, 1))`
}

function cylinderGeometry(segments = 64, radius = 1, height = 0.1) {
  const points = [], normals = [], indices = [], counts = []
  const half = height / 2
  for (let row = 0; row <= 1; row += 1) {
    const y = row === 0 ? half : -half
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * TAU
      const x = Math.sin(angle), z = Math.cos(angle)
      points.push([radius * x, y, radius * z]); normals.push([x, 0, z])
    }
  }
  for (let index = 0; index < segments; index += 1) {
    const a = index, d = index + 1, b = segments + 1 + index, c = b + 1
    indices.push(a, b, d, b, c, d); counts.push(3, 3)
  }
  const addCap = (top) => {
    const y = top ? half : -half, center = points.length
    points.push([0, y, 0]); normals.push([0, top ? 1 : -1, 0])
    for (let index = 0; index <= segments; index += 1) {
      const angle = index / segments * TAU
      points.push([radius * Math.sin(angle), y, radius * Math.cos(angle)]); normals.push([0, top ? 1 : -1, 0])
    }
    for (let index = 0; index < segments; index += 1) {
      const p0 = center + 1 + index, p1 = p0 + 1
      indices.push(center, top ? p0 : p1, top ? p1 : p0); counts.push(3)
    }
  }
  addCap(true); addCap(false)
  return { points, normals, indices, counts }
}

function tuples(values) { return `[${values.map((value) => `(${value.map((number) => Number(number.toFixed(8))).join(",")})`).join(",")}]` }
function list(values) { return `[${values.join(",")}]` }

const geometry = cylinderGeometry()
const mesh = `def Mesh "CoinMesh" (prepend apiSchemas = ["MaterialBindingAPI"]) {
  uniform token subdivisionScheme = "none"
  point3f[] points = ${tuples(geometry.points)}
  int[] faceVertexCounts = ${list(geometry.counts)}
  int[] faceVertexIndices = ${list(geometry.indices)}
  normal3f[] normals = ${tuples(geometry.normals)} (interpolation = "vertex")
  rel material:binding = </CoinLoader/CoinMaterial>
}`

const coins = Array.from({ length: count }, (_, index) => {
  const angle = index / count * 360
  const positionAngle = (index / count * TAU) + TAU / count
  const x = Math.cos(positionAngle) * 3 * spread
  const y = Math.sin(positionAngle) * 3 * spread
  const tumbleDegrees = (time) => cycleDegrees(time, speed)
  const animated = duration > 0
  const baseY = 180 / count
  const transform = (time) => matrix4(tumbleDegrees(time), baseY + tumbleDegrees(time), angle + 90 + tumbleDegrees(time), x, y, coinSize)
  const bakedTransform = animated ? `matrix4d xformOp:transform.timeSamples = ${samples(transform)}` : `matrix4d xformOp:transform = ${transform(0)}`
  return `def Xform "Coin${index + 1}" {
  ${bakedTransform}
  uniform token[] xformOpOrder = ["xformOp:transform"]
  ${mesh}
}`
}).join("\n")

const ringRotation = duration > 0
  ? `matrix4d xformOp:transform:ring.timeSamples = ${samples((time) => matrix4(0, 0, -cycleDegrees(time, ringSpeed), 0, 0, 1))}`
  : "matrix4d xformOp:transform:ring = ((1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0,1))"

const model = `#usda 1.0
(
  defaultPrim = "CoinLoader"
  metersPerUnit = 1
  upAxis = "Y"
  startTimeCode = 0
  endTimeCode = ${timelineEndTimeCode}
  framesPerSecond = ${fps}
  timeCodesPerSecond = ${fps}
  playbackMode = "loop"
  autoPlay = true
)
def Xform "CoinLoader" {
  ${ringRotation}
  float3 xformOp:scale = (0.6,0.6,0.6)
  uniform token[] xformOpOrder = ["xformOp:transform:ring","xformOp:scale"]
  def Material "CoinMaterial" {
    token outputs:surface.connect = </CoinLoader/CoinMaterial/Surface.outputs:surface>
    def Shader "Surface" {
      uniform token info:id = "UsdPreviewSurface"
      color3f inputs:diffuseColor = (${baseColor.map((value) => value.toFixed(6)).join(",")})
      float inputs:metallic = 1
      float inputs:roughness = 0.2
      token outputs:surface
    }
  }
  ${coins}
}`

const files = { "model.usda": strToU8(model) }
const aligned = {}
let position = 0
for (const [name, data] of Object.entries(files)) {
  const padding = (64 - (position + 30 + name.length + 4) % 64) % 64
  aligned[name] = [data, { extra: { 6530: new Uint8Array(padding) } }]
  position += 30 + name.length + 4 + padding + data.length
}
await writeFile(outputPath, zipSync(aligned, { level: 0 }))
console.log(`${outputPath}\n${duration > 0 ? `${duration}s loop + ${delay}s delay @ ${fps} FPS, ${timelineFrameCount} unique timeline samples (timeCodes 0…${timelineEndTimeCode})` : "static model"}`)
