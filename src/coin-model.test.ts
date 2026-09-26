import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { buildCoinModelUsdz, createCoinModelScene, loadCoinModel } from "./coin-model";
import { coinModelFormat, type CoinModelAsset } from "./coin-model-asset";
import { DEFAULT_COIN_FAN } from "./coin-fan";

const scratch = mkdtempSync(join(tmpdir(), "coin-model-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function triangleGlb(height = 1): CoinModelAsset {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, height, 0]);
  const manifest = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, height, 0] }],
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
    expect(usda).toContain('def Xform "Root" (\n\tkind = "component"');
    expect(usda).toMatch(/def Xform "Root" \([\s\S]*?\)\n\{\n\tfloat3\[\] extentsHint = \[[^\n]+\]\n\tdef Xform "CoinRing"/);
    expect(usda).not.toContain('def Scope "Scenes"');
    expect(usda).not.toContain('def Xform "Scene"');
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

  it("uses distinct models and per-position scale/orientation in preview and USDZ", async () => {
    const shared = triangleGlb();
    const alternate = triangleGlb(2);
    const models = await Promise.all([loadCoinModel(shared), loadCoinModel(alternate)]);
    const slots = [
      { scale: 100, rotationX: 0, rotationY: 0, rotationZ: 0 },
      { asset: alternate, scale: 150, rotationX: 10, rotationY: 30, rotationZ: -20 },
    ];
    const scene = createCoinModelScene(models, 2, 100, 100, slots);
    expect(scene.coins[0].children[0].scale.x).toBe(1);
    expect(scene.coins[1].children[0].scale.x).toBe(1.5);
    expect(scene.coins[1].children[0].rotation.y).toBeCloseTo(Math.PI / 6);
    const output = await buildCoinModelUsdz({
      asset: shared, slots, duration: 1, delay: 0, fps: 2,
      speed: 100, ringSpeed: 50, count: 2, coinSize: 100, spread: 100,
    });
    const usda = strFromU8(unzipSync(output.bytes)["model.usda"]);
    expect(usda).toContain('def Xform "CoinContent1"');
    expect(usda).toContain('def Xform "CoinContent2"');
    expect(usda).toContain('def Xform "Coin1"');
    expect(usda).toContain('def Xform "Coin2"');
    const path = join(scratch, "distinct-models.usdz");
    writeFileSync(path, output.bytes);
    execFileSync("/usr/bin/usdchecker", [path]);
  });

  it("exports the opening fan, original orbit, and closing deck as animated transforms", async () => {
    const group = createCoinModelScene(await loadCoinModel(triangleGlb()), 2, 100, 100);
    const fan = { ...DEFAULT_COIN_FAN, enabled: true };
    group.setTime(0, 100, 50, 2, false, fan);
    const startRing = group.ring.quaternion.clone();
    const startCoin = group.coins[0].quaternion.clone();
    const startPosition = group.coins[0].position.clone();
    expect(group.coins[0].position.x).toBeCloseTo(group.coins[1].position.x);
    group.setTime(0.22, 100, 50, 2, false, fan);
    expect(group.coins[0].position.x).toBeLessThan(group.coins[1].position.x);
    expect(group.ring.quaternion.angleTo(startRing)).toBeCloseTo(0);
    group.setTime(1, 100, 50, 2, false, fan);
    expect(group.coins[0].position.distanceTo(group.coins[1].position)).toBeGreaterThan(2);
    group.setTime(2, 100, 50, 2, false, fan);
    expect(group.coins[0].position.x).toBeCloseTo(group.coins[1].position.x);
    expect(group.coins[0].position.distanceTo(startPosition)).toBeCloseTo(0);
    expect(group.coins[0].quaternion.angleTo(startCoin)).toBeCloseTo(0);
    expect(group.ring.quaternion.angleTo(startRing)).toBeCloseTo(0);
    const result = await buildCoinModelUsdz({
      asset: triangleGlb(), duration: 2, delay: 0, fps: 24,
      speed: 100, ringSpeed: 50, count: 2, coinSize: 100, spread: 100,
      fan,
    });
    const usda = strFromU8(unzipSync(result.bytes)["model.usda"]);
    expect(usda).toContain("endTimeCode = 47");
    expect(usda).toContain("xformOp:translate.timeSamples");
    const bounds = usda.match(/float3\[\] extentsHint = \[\(([^)]+)\), \(([^)]+)\)\]/);
    expect(bounds).not.toBeNull();
    const minimum = bounds![1].split(",").map(Number);
    const maximum = bounds![2].split(",").map(Number);
    expect(maximum[0] - minimum[0]).toBeGreaterThan(3.5);
    expect(maximum[1] - minimum[1]).toBeCloseTo(maximum[0] - minimum[0]);
    const output = join(scratch, "fan-opening.usdz");
    writeFileSync(output, result.bytes);
    execFileSync("/usr/bin/usdchecker", [output]);
  });

  it("hinges eight models around the same lower-left pivot before moving outward", async () => {
    const group = createCoinModelScene(await loadCoinModel(triangleGlb()), 8, 100, 100);
    const fan = { ...DEFAULT_COIN_FAN, enabled: true };
    group.setTime(1.1, 100, 50, 10, false, fan);
    const pivotPoints = group.coins.map((coin) => {
      const local = (coin.userData.fanPivot as import("three").Vector3).clone().multiplyScalar(coin.scale.x);
      return local.applyQuaternion(coin.quaternion).add(coin.position);
    });
    pivotPoints.forEach((pivot) => {
      expect(pivot.x).toBeCloseTo(pivotPoints[0].x);
      expect(pivot.y).toBeCloseTo(pivotPoints[0].y);
    });
    expect(pivotPoints[0].x).toBeCloseTo(0);
    expect(pivotPoints[0].y).toBeCloseTo(0);
    const radii = group.coins.map((coin) => Math.hypot(coin.position.x, coin.position.y));
    radii.forEach((radius) => expect(radius).toBeCloseTo(radii[0]));
    expect(radii[0]).toBeGreaterThan(1);
    const initialRays = group.coins.map((coin) => Math.atan2(coin.position.y, coin.position.x));
    const initialOrientations = group.coins.map((coin) => coin.quaternion.clone());
    const initialRingRotation = group.ring.quaternion.clone();
    group.setTime(1.8, 100, 50, 10, false, fan);
    expect(group.ring.quaternion.angleTo(initialRingRotation)).toBeGreaterThan(0);
    group.coins.forEach((coin, index) => {
      expect(Math.hypot(coin.position.x, coin.position.y)).toBeGreaterThan(radii[index]);
      expect(Math.cos(initialRays[index]) * coin.position.y - Math.sin(initialRays[index]) * coin.position.x).toBeCloseTo(0);
      expect(Math.cos(initialRays[index]) * coin.position.x + Math.sin(initialRays[index]) * coin.position.y).toBeGreaterThan(0);
      expect(coin.quaternion.angleTo(initialOrientations[index])).toBeGreaterThan(0);
    });
  });

  it("keeps the ring turning while cards finish flipping before the closing stack overlaps", async () => {
    const group = createCoinModelScene(await loadCoinModel(triangleGlb()), 8, 100, 100);
    const fan = { ...DEFAULT_COIN_FAN, enabled: true };
    group.setTime(8, 100, 50, 10, false, fan);
    const ringAtClosingStart = group.ring.quaternion.clone();
    const cardAtClosingStart = group.coins[0].quaternion.clone();
    group.setTime(8.3, 100, 50, 10, false, fan);
    expect(group.ring.quaternion.angleTo(ringAtClosingStart)).toBeGreaterThan(0);
    expect(group.coins[0].quaternion.angleTo(cardAtClosingStart)).toBeGreaterThan(0);
    group.setTime(8.45, 100, 50, 10, false, fan);
    const ringAfterFlipStops = group.ring.quaternion.clone();
    const cardAfterFlipStops = group.coins[0].quaternion.clone();
    group.setTime(8.8, 100, 50, 10, false, fan);
    expect(group.ring.quaternion.angleTo(ringAfterFlipStops)).toBeGreaterThan(0);
    expect(group.coins[0].quaternion.angleTo(cardAfterFlipStops)).toBeCloseTo(0);
  });

  it("keeps each differently oriented card on its own radial slot during dispersion", async () => {
    const models = await Promise.all([loadCoinModel(triangleGlb()), loadCoinModel(triangleGlb(2))]);
    const slots = [
      { scale: 100, rotationX: 0, rotationY: 0, rotationZ: 30 },
      { scale: 135, rotationX: 0, rotationY: 0, rotationZ: -25 },
    ];
    const group = createCoinModelScene(models, 2, 100, 100, slots);
    const fan = { ...DEFAULT_COIN_FAN, enabled: true };
    group.setTime(1.1, 100, 50, 10, false, fan);
    const orientations = group.coins.map((coin) => coin.quaternion.clone());
    const directions = group.coins.map((coin) => coin.position.clone().normalize());
    group.setTime(1.8, 100, 50, 10, false, fan);
    group.coins.forEach((coin, index) => {
      const expected = new Vector3(
        Math.cos((index + 1) * Math.PI), Math.sin((index + 1) * Math.PI), 0,
      );
      expect(directions[index].dot(expected)).toBeCloseTo(1);
      expect(coin.position.clone().normalize().dot(expected)).toBeCloseTo(1);
      expect(coin.quaternion.angleTo(orientations[index])).toBeGreaterThan(0);
    });
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
