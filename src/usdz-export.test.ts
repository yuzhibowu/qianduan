import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { unzipSync, strFromU8 } from "fflate"
import { afterAll, describe, expect, it } from "vitest"

const scratch = mkdtempSync(resolve(tmpdir(), "originkit-usdz-loop-"))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe("animated USDZ loop boundary", () => {
  it("writes 180 unique samples for a 3 second 60 FPS loop", () => {
    const output = resolve(scratch, "loop.usdz")
    execFileSync(process.execPath, [
      resolve(process.cwd(), "scripts/export-coin-usdz.mjs"), output,
      "--duration", "3", "--delay", "0", "--fps", "60",
    ])
    const archive = unzipSync(new Uint8Array(readFileSync(output)))
    const usda = strFromU8(archive["model.usda"])

    expect(usda).toContain("endTimeCode = 179")
    expect(usda).toContain('playbackMode = "loop"')
    expect(usda).toContain("autoPlay = true")
    expect(usda).toMatch(/xformOp:transform\.timeSamples = \{0:/)
    expect(usda).toMatch(/,179:/)
    expect(usda).not.toMatch(/,180:/)
  })
})
