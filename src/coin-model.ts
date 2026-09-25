import {
  AnimationClip,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  MeshStandardMaterial,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  Vector3,
  type Object3D,
  type Texture,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { USDLoader } from "three/addons/loaders/USDLoader.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { strFromU8, strToU8, unzipSync } from "fflate";
import { evaluateCoinMotion, rotationsPerCycle, TAU } from "./time";
import { packAlignedUsdz } from "./usdz";
import { applyToHex, applyToImageData, linearToSrgb, srgbToLinear, type ColorComp } from "./lib/color";
import type { CoinModelAsset } from "./coin-model-asset";

function assertStaticMeshes(root: Object3D) {
  let meshCount = 0;
  root.traverse((object) => {
    if ((object as Mesh).isMesh) {
      if ((object as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh)
        throw new Error("暂不支持骨骼模型，请导入静态网格 GLB 或 USDZ");
      meshCount += 1;
    }
  });
  if (!meshCount) throw new Error("文件中没有可显示的 3D 网格");
}

const modelCache = new WeakMap<ArrayBuffer, Promise<Group>>();

export function loadCoinModel(asset: CoinModelAsset): Promise<Group> {
  const existing = modelCache.get(asset.bytes);
  if (existing) return existing;
  const pending = parseCoinModel(asset).catch((error: unknown) => {
    modelCache.delete(asset.bytes);
    throw error;
  });
  modelCache.set(asset.bytes, pending);
  return pending;
}

async function parseCoinModel(asset: CoinModelAsset): Promise<Group> {
  // Offscreen exports read the asset from the parent window. Copy into this
  // window's realm before passing it to loaders that use `instanceof ArrayBuffer`.
  const localBytes = new Uint8Array(asset.bytes).slice().buffer;
  let root: Object3D;
  let embeddedAnimations = 0;
  if (asset.format === "glb") {
    const bytes = new Uint8Array(localBytes);
    if (bytes.length < 12 || bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46)
      throw new Error("GLB 文件格式无效");
    const loaded = await new GLTFLoader().parseAsync(localBytes, "");
    root = loaded.scene;
    embeddedAnimations = loaded.animations.length;
  } else {
    const bytes = new Uint8Array(localBytes);
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
      throw new Error("USDZ 文件格式无效");
    root = await new Promise<Group>((resolve, reject) => {
      try {
        new USDLoader().parse(localBytes, "", resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
    embeddedAnimations = root.animations.length;
  }
  assertStaticMeshes(root);
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  const diameter = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(diameter) || diameter <= 0)
    throw new Error("模型尺寸无效，无法放入 Coin Loader");
  const center = bounds.getCenter(new Vector3());
  const normalized = new Group();
  normalized.name = "ImportedModel";
  const centered = new Group();
  centered.position.copy(center).multiplyScalar(-1);
  centered.add(root);
  normalized.scale.setScalar(2 / diameter);
  normalized.add(centered);
  normalized.userData.embeddedAnimations = embeddedAnimations;
  return normalized;
}

const zAxis = new Vector3(0, 0, 1);
const xAxis = new Vector3(1, 0, 0);
const yAxis = new Vector3(0, 1, 0);

function coinQuaternion(index: number, count: number, tumble: number) {
  return new Quaternion()
    .setFromAxisAngle(zAxis, (index / count) * TAU)
    .multiply(new Quaternion().setFromAxisAngle(xAxis, tumble))
    .multiply(new Quaternion().setFromAxisAngle(yAxis, Math.PI / count + tumble))
    .multiply(new Quaternion().setFromAxisAngle(zAxis, Math.PI / 2 + tumble));
}

export function createCoinModelScene(model: Group, count: number, coinSize: number, spread: number) {
  const safeCount = Math.max(1, Math.round(count));
  const scene = new Scene();
  const ring = new Group();
  ring.name = "CoinRing";
  ring.scale.setScalar(0.6);
  scene.add(ring);
  const coins = Array.from({ length: safeCount }, (_, index) => {
    const positionAngle = ((index + 1) / safeCount) * TAU;
    const coin = new Group();
    coin.name = `Coin${index + 1}`;
    coin.position.set(
      Math.cos(positionAngle) * 3 * spread / 100,
      Math.sin(positionAngle) * 3 * spread / 100,
      0,
    );
    coin.scale.setScalar(coinSize / 100);
    coin.add(model.clone(true));
    ring.add(coin);
    return coin;
  });
  const setTime = (time: number, speed: number, ringSpeed: number, duration: number, continuous = false) => {
    const motion = evaluateCoinMotion(time, speed, ringSpeed, duration);
    const phase = Math.max(0, time) / Math.max(0.001, duration);
    const tumble = continuous ? TAU * phase * rotationsPerCycle(speed) : motion.tumble;
    const ringPhase = continuous ? TAU * phase * rotationsPerCycle(ringSpeed) : motion.ringPhase;
    ring.quaternion.setFromAxisAngle(zAxis, -ringPhase);
    coins.forEach((coin, index) => coin.quaternion.copy(coinQuaternion(index, safeCount, tumble)));
  };
  return { scene, ring, coins, setTime };
}

export function addCoinModelPreviewLights(scene: Scene) {
  scene.add(new AmbientLight(0xffffff, 2.2));
  const key = new DirectionalLight(0xffffff, 3.2);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 1.4);
  fill.position.set(6, -3, -5);
  scene.add(fill);
}

export function createCoinModelCamera(distance: number, aspect: number) {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 200);
  camera.position.z = distance / Math.min(1, aspect);
  return camera;
}

export type CoinModelUsdzSettings = {
  asset: CoinModelAsset;
  duration: number;
  delay: number;
  fps: number;
  speed: number;
  ringSpeed: number;
  count: number;
  coinSize: number;
  spread: number;
  colorComp?: ColorComp;
  emissiveLift?: number;
  unlit?: boolean;
};

function compensateModelMaterials(model: Group, profile: ColorComp, lift: number, unlit: boolean) {
  const textureCache = new Map<string, Texture>();
  const compensateTexture = (texture: Texture, tint: Color) => {
    const cacheKey = `${texture.uuid}:${tint.r}:${tint.g}:${tint.b}`;
    const cached = textureCache.get(cacheKey);
    if (cached) return cached;
    const image = texture.image as CanvasImageSource & { width?: number; height?: number };
    if (!image?.width || !image?.height)
      throw new Error("模型贴图无法读取，不能启用偏色抵消");
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法创建模型贴图画布");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    if (tint.r !== 1 || tint.g !== 1 || tint.b !== 1) {
      const data = pixels.data;
      for (let offset = 0; offset < data.length; offset += 4) {
        data[offset] = Math.round(255 * linearToSrgb(srgbToLinear(data[offset] / 255) * tint.r));
        data[offset + 1] = Math.round(255 * linearToSrgb(srgbToLinear(data[offset + 1] / 255) * tint.g));
        data[offset + 2] = Math.round(255 * linearToSrgb(srgbToLinear(data[offset + 2] / 255) * tint.b));
      }
    }
    applyToImageData(pixels.data, profile);
    context.putImageData(pixels, 0, 0);
    const result = texture.clone();
    result.image = canvas;
    result.needsUpdate = true;
    textureCache.set(cacheKey, result);
    return result;
  };
  model.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    const mesh = object as Mesh;
    const convert = (source: MeshStandardMaterial) => {
      const material = new MeshStandardMaterial({
        color: source.color?.clone() ?? 0xffffff,
        opacity: source.opacity,
        transparent: source.transparent,
        alphaTest: source.alphaTest,
        side: source.side,
      });
      material.metalness = 0;
      material.roughness = 0.9;
      if (source.map) {
        const texture = compensateTexture(source.map, material.color);
        material.map = texture;
        material.emissiveMap = texture;
        material.color.setRGB(unlit ? 0 : 1, unlit ? 0 : 1, unlit ? 0 : 1);
        material.emissive.setRGB(unlit ? 1 : lift, unlit ? 1 : lift, unlit ? 1 : lift);
      } else {
        material.color.set(applyToHex(`#${material.color.getHexString()}`, profile));
        material.emissive.copy(material.color).multiplyScalar(unlit ? 1 : lift);
        if (unlit) material.color.setRGB(0, 0, 0);
      }
      return material;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => convert(material as MeshStandardMaterial))
      : convert(mesh.material as MeshStandardMaterial);
  });
}

export async function buildCoinModelUsdz(settings: CoinModelUsdzSettings) {
  const model = (await loadCoinModel(settings.asset)).clone(true);
  if (settings.colorComp)
    compensateModelMaterials(model, settings.colorComp, settings.emissiveLift ?? 0.5, Boolean(settings.unlit));
  const { scene, ring, coins, setTime } = createCoinModelScene(
    model, settings.count, settings.coinSize, settings.spread,
  );
  const frames = Math.max(1, Math.round((settings.duration + settings.delay) * settings.fps));
  const times = new Float32Array(frames);
  const targets = [ring, ...coins];
  const values = targets.map(() => new Float32Array(frames * 4));
  for (let frame = 0; frame < frames; frame += 1) {
    times[frame] = frame / settings.fps;
    setTime(Math.max(0, times[frame] - settings.delay), settings.speed, settings.ringSpeed, settings.duration, true);
    targets.forEach((target, index) => target.quaternion.toArray(values[index], frame * 4));
  }
  const tracks = targets.map((target, index) =>
    new QuaternionKeyframeTrack(`${target.name}.quaternion`, times, values[index]));
  const clip = new AnimationClip("Coin Loader", (frames - 1) / settings.fps, tracks);
  scene.updateMatrixWorld(true);
  const raw = await new USDZExporter().parseAsync(scene, {
    animations: [clip],
    animationFrameRate: settings.fps,
    includeAnchoringProperties: false,
    quickLookCompatible: true,
    maxTextureSize: 4096,
  });
  const entries = unzipSync(new Uint8Array(raw));
  const root = entries["model.usda"];
  if (!root) throw new Error("模型 USDZ 导出缺少根图层");
  const usda = strFromU8(root).replace(
    /upAxis = "Y"/,
    'upAxis = "Y"\n\tplaybackMode = "loop"\n\tautoPlay = true',
  );
  const files = Object.entries(entries).map(([name, data]) => ({
    name,
    data: name === "model.usda" ? strToU8(usda) : data,
  }));
  return { bytes: packAlignedUsdz(files), frames };
}
