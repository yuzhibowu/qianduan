import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildCoinUsdz,
  buildDiscSplitUsdz,
  buildFrostedTypeBandUsdz,
  buildGyroLoaderUsdz,
  compensateUsdzTexturePixels,
  textureMaterialDefinition,
} from "./usdz";
import { CARD_COMP, DEFAULT_COMP, FREEFORM_COMP } from "./lib/color";
import { materialFromPreset } from "./appearance";

const scratch = mkdtempSync(resolve(tmpdir(), "originkit-usdz-loop-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("animated USDZ loop boundary", () => {
  it("builds an Apple-valid USDZ entirely in browser-compatible code", async () => {
    const output = resolve(process.cwd(), "artifacts/browser-generated.usdz");
    const result = await buildCoinUsdz({
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

  it("writes dense geometry-specific compensation and emissive lift into the material", async () => {
    expect(DEFAULT_COMP.samples).toHaveLength(1130);
    expect(CARD_COMP.samples).toHaveLength(1130);
    expect(FREEFORM_COMP.samples).toHaveLength(1130);
    expect(FREEFORM_COMP.calibratedLift).toBe(0);
    expect(FREEFORM_COMP.calibratedMaterial).toBe("paper");
    expect(DEFAULT_COMP.matrix).not.toEqual(FREEFORM_COMP.matrix);
    expect(DEFAULT_COMP.matrix).not.toEqual(CARD_COMP.matrix);
    const result = await buildCoinUsdz({
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
    expect(usda).toContain("float inputs:metallic = 0");
    expect(usda).toContain("float inputs:roughness = 0.9");
    expect(usda).toMatch(/color3f inputs:emissiveColor = \((?!0\.000000,0\.000000,0\.000000)/);
    expect(usda).not.toContain(
      "color3f inputs:diffuseColor = (0.063010,0.223228,0.456411)",
    );
  });

  it("precompensates texture pixels in encoded sRGB space", () => {
    const imageData = {
      data: new Uint8ClampedArray([51, 102, 204, 255]),
    };
    const original = Array.from(imageData.data);
    compensateUsdzTexturePixels(imageData, DEFAULT_COMP);
    expect(Array.from(imageData.data)).not.toEqual(original);
    expect(imageData.data[3]).toBe(255);
  });

  it("uses the Freeform measured profile without Keynote's emissive lift", async () => {
    const result = await buildCoinUsdz({
      duration: 1, delay: 0, fps: 1, speed: 100, ringSpeed: 50,
      count: 1, coinSize: 100, spread: 100, baseColor: "#4682B4",
      colorComp: FREEFORM_COMP,
      emissiveLift: FREEFORM_COMP.calibratedLift ?? 0,
      unlit: false,
    });
    const usda = strFromU8(unzipSync(result.bytes)["model.usda"]);
    expect(usda).toContain("float inputs:metallic = 0");
    expect(usda).toContain("float inputs:roughness = 0.9");
    expect(usda).toContain("color3f inputs:emissiveColor = (0.000000,0.000000,0.000000)");
  });

  it("uses one texture asset for diffuse and 50 percent emissive slots", () => {
    const usda = textureMaterialDefinition(
      "Card",
      "CardMaterial",
      "textures/card.png",
      materialFromPreset("plastic"),
      true,
      0.5,
    );
    expect(usda).toContain(
      "inputs:diffuseColor.connect = </Card/CardMaterial/Texture.outputs:rgb>",
    );
    expect(usda).toContain(
      "inputs:emissiveColor.connect = </Card/CardMaterial/EmissiveTexture.outputs:rgb>",
    );
    expect(usda.match(/@textures\/card\.png@/g)).toHaveLength(2);
    expect(usda).toContain("float4 inputs:scale = (0.5000,0.5000,0.5000,1)");
    expect(usda).not.toMatch(/inputs:scale = \(([1-9][0-9]*\.|[2-9])/) ;
    expect(usda).toContain("float inputs:metallic = 0");
    expect(usda).toContain("float inputs:roughness = 0.9");
  });

  it("builds Disc Split as real animated wedge geometry with one unique loop", async () => {
    const output = resolve(scratch, "disc-split.usdz");
    const result = await buildDiscSplitUsdz({
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

  it("embeds front and back artwork as separate USDZ material slots", async () => {
    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8dZAAAAAElFTkSuQmCC";
    const output = resolve(scratch, "textured-coin.usdz");
    const result = await buildCoinUsdz({
      duration: 1,
      delay: 0,
      fps: 2,
      speed: 50,
      ringSpeed: 50,
      count: 1,
      coinSize: 100,
      spread: 100,
      baseColor: "#FFFFFF",
    appearance: {
      enabled: true,
      material: {
          preset: "gold",
          color: "#D4A928",
          metallic: 1,
          roughness: 0.18,
          opacity: 1,
          ior: 1.5,
        },
        frontTexture: pixel,
        backTexture: pixel,
      },
    });
    writeFileSync(output, result.bytes);
    const archive = unzipSync(result.bytes);
    const usda = strFromU8(archive["model.usda"]);
    expect(archive["textures/front.png"]).toBeTruthy();
    expect(archive["textures/back.png"]).toBeTruthy();
    expect(usda).toContain('def GeomSubset "Front"');
    expect(usda).toContain('def GeomSubset "Back"');
    expect(usda).toContain('uniform token info:id = "UsdUVTexture"');
    const check = spawnSync("/usr/bin/usdchecker", [output], { encoding: "utf8" });
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

  it("builds Frosted Type Band as a textured animated 3D ring", async () => {
    const output = resolve(scratch, "frosted-type-band.usdz");
    const png = new Uint8Array(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8dZAAAAAElFTkSuQmCC",
      "base64",
    ));
    const result = await buildFrostedTypeBandUsdz({
      duration: 3,
      delay: 0,
      fps: 30,
      speed: 100,
      ringSpeed: 0,
      count: 4,
      coinSize: 100,
      spread: 100,
      baseColor: "#FEFF00",
      frostedTypeBand: {
        items: "设计|动效|系统|品牌",
        fontSize: 16,
        fontFamily: "PingFang SC",
        fontWeight: 700,
        fontStyle: "normal",
        letterSpacing: 0,
        textColor: "#FEFF00",
        speed: 100,
        distance: 810,
        tilt: 0,
        gap: 83,
        blur: 100,
        refraction: 50,
        tint: "#FAFAFF42",
        grain: 0,
      },
    }, [{ bytes: png, aspect: 8 }]);
    writeFileSync(output, result.bytes);
    expect(result.frames).toBe(90);
    const archive = unzipSync(result.bytes);
    const usda = strFromU8(archive["model.usda"]);
    expect(usda).toContain('def Mesh "TextBand"');
    expect(usda).toContain("endTimeCode = 89");
    expect(usda).not.toMatch(/,90:/);
    expect(archive["textures/text-band.png"]).toBeTruthy();
    expect(usda).not.toContain("Front");
    expect(usda).toContain(
      "</FrostedTypeBand/GlassMaterial/Surface.outputs:surface>",
    );
    expect(usda).toContain(
      "</FrostedTypeBand/TextMaterial/Texture.outputs:a>",
    );
    expect(usda).not.toContain(
      "connect = <TextMaterial/Texture.outputs:a>",
    );
    const check = spawnSync("/usr/bin/usdchecker", [output], { encoding: "utf8" });
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });
});
