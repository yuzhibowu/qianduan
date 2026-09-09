import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { buildCoinUsdz, buildDiscSplitUsdz, buildGyroLoaderUsdz } from "./usdz";
import { DEFAULT_COMP, FREEFORM_COMP } from "./lib/color";

const scratch = mkdtempSync(resolve(tmpdir(), "originkit-usdz-loop-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("animated USDZ loop boundary", () => {
  it("builds an Apple-valid USDZ entirely in browser-compatible code", () => {
    const output = resolve(process.cwd(), "artifacts/browser-generated.usdz");
    const result = buildCoinUsdz({
      duration: 3,
      delay: 0,
      fps: 60,
      speed: 100,
      ringSpeed: 50,
      count: 8,
      coinSize: 100,
      spread: 100,
      baseColor: "#FFFFFF",
    });
    writeFileSync(output, result.bytes);
    expect(result.frames).toBe(180);
    const check = spawnSync("/usr/bin/usdchecker", [output], {
      encoding: "utf8",
    });
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });

  it("writes 180 unique samples for a 3 second 60 FPS loop", () => {
    const output = resolve(scratch, "loop.usdz");
    execFileSync(process.execPath, [
      resolve(process.cwd(), "scripts/export-coin-usdz.mjs"),
      output,
      "--duration",
      "3",
      "--delay",
      "0",
      "--fps",
      "60",
    ]);
    const archive = unzipSync(new Uint8Array(readFileSync(output)));
    const usda = strFromU8(archive["model.usda"]);

    expect(usda).toContain("endTimeCode = 179");
    expect(usda).toContain('playbackMode = "loop"');
    expect(usda).toContain("autoPlay = true");
    expect(usda).toMatch(/xformOp:transform\.timeSamples = \{0:/);
    expect(usda).toMatch(/,179:/);
    expect(usda).not.toMatch(/,180:/);
  });

  it("writes target-specific 117-swatch compensation and emissive lift into the material", () => {
    expect(DEFAULT_COMP.samples).toHaveLength(117);
    expect(FREEFORM_COMP.samples).toHaveLength(117);
    expect(DEFAULT_COMP.matrix).not.toEqual(FREEFORM_COMP.matrix);
    const result = buildCoinUsdz({
      duration: 3,
      delay: 0,
      fps: 30,
      speed: 100,
      ringSpeed: 50,
      count: 8,
      coinSize: 100,
      spread: 100,
      baseColor: "#4682B4",
      colorComp: DEFAULT_COMP,
      emissiveLift: 0.5,
      unlit: false,
    });
    const archive = unzipSync(result.bytes);
    const usda = strFromU8(archive["model.usda"]);
    expect(usda).toContain("inputs:emissiveColor");
    expect(usda).not.toContain(
      "color3f inputs:diffuseColor = (0.063010,0.223228,0.456411)",
    );
  });

  it("builds Disc Split as real animated wedge geometry with one unique loop", () => {
    const output = resolve(scratch, "disc-split.usdz");
    const result = buildDiscSplitUsdz({
      duration: 3,
      delay: 0,
      fps: 30,
      speed: 50,
      ringSpeed: 0,
      count: 6,
      coinSize: 90,
      spread: 71,
      innerRadius: 31,
      baseColor: "#FFFFFF",
      accentColor: "#FFFFFF",
    });
    writeFileSync(output, result.bytes);
    expect(result.frames).toBe(90);
    const archive = unzipSync(result.bytes);
    const usda = strFromU8(archive["model.usda"]);
    expect(usda).toContain('def Xform "Piece6"');
    expect(usda).toContain("endTimeCode = 89");
    expect(usda).not.toMatch(/,90:/);
    const middleFrameMatrices = Array.from(
      usda.matchAll(/30: (\(\([^\n]+\)\))/g),
      (match) => match[1],
    );
    expect(middleFrameMatrices).toHaveLength(6);
    expect(new Set(middleFrameMatrices).size).toBe(6);
    expect(
      middleFrameMatrices.every((matrix) => {
        const rows = Array.from(matrix.matchAll(/\(([^()]*)\)/g));
        const translation =
          rows.at(-1)?.[1].split(",").slice(0, 3).map(Number) ?? [];
        return translation.some((value) => Math.abs(value) > 0.001);
      }),
    ).toBe(true);
    const check = spawnSync("/usr/bin/usdchecker", [output], {
      encoding: "utf8",
    });
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });

  it("builds Gyro Loader as separately animated torus geometry", () => {
    const output = resolve(scratch, "gyro-loader.usdz");
    const result = buildGyroLoaderUsdz({
      duration: 2.45,
      delay: 0,
      fps: 30,
      speed: 50,
      ringSpeed: 500,
      count: 4,
      coinSize: 100,
      spread: 150,
      baseColor: "#FFFFFF",
      accentColor: "#FFFFFF",
    });
    writeFileSync(output, result.bytes);
    const archive = unzipSync(result.bytes);
    const usda = strFromU8(archive["model.usda"]);
    expect(usda).toContain('def Xform "Ring4"');
    expect(usda).toContain(`endTimeCode = ${result.frames - 1}`);
    const check = spawnSync("/usr/bin/usdchecker", [output], {
      encoding: "utf8",
    });
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });
});
