import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { buildCoinModelUsdz, createCoinModelScene, loadCoinModel } from "./coin-model";
import { coinModelFormat, type CoinModelAsset } from "./coin-model-asset";

const scratch = mkdtempSync(join(tmpdir(), "coin-model-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function triangleGlb(): CoinModelAsset {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
  const manifest = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  });
  const json = new TextEncoder().encode(manifest);
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const buffer = new ArrayBuffer(12 + 8 + jsonLength + 8 + positions.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, jsonLength).fill(0x20);
  new Uint8Array(buffer, 20, json.length).set(json);
  const binaryOffset = 20 + jsonLength;
  view.setUint32(binaryOffset, positions.byteLength, true);
  view.setUint32(binaryOffset + 4, 0x004e4942, true);
  new Float32Array(buffer, binaryOffset + 8, positions.length).set(positions);
  return { name: "triangle.glb", format: "glb", bytes: buffer };
}

describe("Coin Loader imported 3D model", () => {
  it("accepts GLB and USDZ without treating either as a face texture", () => {
    expect(coinModelFormat({ name: "shape.GLB" })).toBe("glb");
    expect(coinModelFormat({ name: "shape.usdz" })).toBe("usdz");
    expect(coinModelFormat({ name: "shape.png" })).toBeNull();
  });

  it("loads GLB geometry and produces a real animated USDZ with unique loop samples", async () => {
    const asset = triangleGlb();
    const normalized = await loadCoinModel(asset);
    let meshCount = 0;
    normalized.traverse((object) => { if ("isMesh" in object) meshCount += 1; });
    expect(meshCount).toBe(1);
    const result = await buildCoinModelUsdz({
      asset, duration: 1, delay: 0, fps: 30,
      speed: 100, ringSpeed: 50, count: 3, coinSize: 100, spread: 100,
    });
    expect(result.frames).toBe(30);
    const archive = unzipSync(result.bytes);
    const usda = strFromU8(archive["model.usda"]);
    expect(usda).toContain("endTimeCode = 29");
    expect(usda).toContain('playbackMode = "loop"');
    expect(usda).toContain('autoPlay = true');
    expect(usda).toContain("xformOp:orient.timeSamples");
    const output = join(scratch, "imported-glb.usdz");
    writeFileSync(output, result.bytes);
    execFileSync("/usr/bin/usdchecker", [output]);
  });

  it("keeps quaternion samples continuous through a two-turn cycle", async () => {
    const model = await loadCoinModel(triangleGlb());
    const group = createCoinModelScene(model, 2, 100, 100);
    let previous = null;
    for (let frame = 0; frame < 30; frame += 1) {
      group.setTime(frame / 30, 100, 50, 1, true);
      const current = group.coins[0].quaternion.clone();
      if (previous) expect(previous.dot(current)).toBeGreaterThan(0.5);
      previous = current;
    }
  });

  it("imports USDZ geometry, then replaces the default coin silhouette", async () => {
    const source = await buildCoinModelUsdz({
      asset: triangleGlb(), duration: 1, delay: 0, fps: 30,
      speed: 100, ringSpeed: 50, count: 1, coinSize: 100, spread: 100,
    });
    const asset: CoinModelAsset = {
      name: "source.usdz",
      format: "usdz",
      bytes: source.bytes.buffer.slice(source.bytes.byteOffset, source.bytes.byteOffset + source.bytes.byteLength) as ArrayBuffer,
    };
    const model = await loadCoinModel(asset);
    let meshCount = 0;
    model.traverse((object) => { if ("isMesh" in object) meshCount += 1; });
    expect(meshCount).toBeGreaterThan(0);
    const result = await buildCoinModelUsdz({
      asset, duration: 1, delay: 0, fps: 30,
      speed: 100, ringSpeed: 50, count: 2, coinSize: 100, spread: 100,
    });
    const output = join(scratch, "imported-usdz.usdz");
    writeFileSync(output, result.bytes);
    execFileSync("/usr/bin/usdchecker", [output]);
  });
});
