import {
  AnimationClip,
  AmbientLight,
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  MeshStandardMaterial,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  Scene,
  Vector3,
  type Object3D,
  type KeyframeTrack,
  type Texture,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { USDLoader } from "three/addons/loaders/USDLoader.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { strFromU8, strToU8, unzipSync } from "fflate";
import { evaluateCoinMotion, rotationsPerCycle, TAU } from "./time";
import { packAlignedUsdz } from "./usdz";
import { applyToHex, applyToImageData, linearToSrgb, srgbToLinear, type ColorComp } from "./lib/color";
import type { CoinModelAsset, CoinModelSlot } from "./coin-model-asset";
import { evaluateCoinFan, fanAngle, type CoinFanSettings } from "./coin-fan";

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
const fanAnchor = new Vector3(0, 0, 0);

function coinQuaternion(index: number, count: number, tumble: number) {
  return new Quaternion()
    .setFromAxisAngle(zAxis, (index / count) * TAU)
    .multiply(new Quaternion().setFromAxisAngle(xAxis, tumble))
    .multiply(new Quaternion().setFromAxisAngle(yAxis, Math.PI / count + tumble))
    .multiply(new Quaternion().setFromAxisAngle(zAxis, Math.PI / 2 + tumble));
}

export function updateCoinFanPivot(coin: Group, content: Group, slot?: CoinModelSlot) {
  const key = `${slot?.scale ?? 100}:${slot?.rotationX ?? 0}:${slot?.rotationY ?? 0}:${slot?.rotationZ ?? 0}`;
  if (coin.userData.fanPivotKey === key) return;
  // Measure in coin-local coordinates, independently of its animated world pose.
  const local = content.clone(true);
  local.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(local);
  coin.userData.fanPivot = new Vector3(bounds.min.x, bounds.min.y, 0);
  coin.userData.fanPivotKey = key;
}

export function createCoinModelScene(model: Group | Group[], count: number, coinSize: number, spread: number, slots: CoinModelSlot[] = []) {
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
    coin.userData.baseScale = coinSize / 100;
    const content = new Group();
    content.name = `CoinContent${index + 1}`;
    const source = Array.isArray(model) ? model[index] ?? model[0] : model;
    content.add(source.clone(true));
    applyCoinModelSlot(content, slots[index]);
    updateCoinFanPivot(coin, content, slots[index]);
    coin.add(content);
    ring.add(coin);
    return coin;
  });
  const setTime = (time: number, speed: number, ringSpeed: number, duration: number, continuous = false, fan?: CoinFanSettings) => {
    const motion = evaluateCoinMotion(time, speed, ringSpeed, duration);
    const phase = Math.max(0, time) / Math.max(0.001, duration);
    const activeFan = fan?.enabled
      ? evaluateCoinFan(time, duration, ringSpeed, fan)
      : null;
    const tumble = activeFan
      ? TAU * activeFan.motionTime / Math.max(0.001, duration) * rotationsPerCycle(speed)
      : continuous ? TAU * phase * rotationsPerCycle(speed) : motion.tumble;
    const ringPhase = activeFan?.rotation ?? (continuous ? TAU * phase * rotationsPerCycle(ringSpeed) : motion.ringPhase);
    ring.quaternion.setFromAxisAngle(zAxis, -ringPhase);
    coins.forEach((coin, index) => {
      coin.quaternion.copy(coinQuaternion(index, safeCount, tumble));
      const positionAngle = ((index + 1) / safeCount) * TAU;
      const radius = 3 * spread / 100;
      coin.position.set(Math.cos(positionAngle) * radius, Math.sin(positionAngle) * radius, 0);
      if (activeFan && fan) {
        const pivotLocal = (coin.userData.fanPivot as Vector3).clone().multiplyScalar(coin.userData.baseScale as number);
        const initialRay = pivotLocal.lengthSq() > 1e-8
          ? Math.atan2(-pivotLocal.y, -pivotLocal.x)
          : Math.PI / 4;
        const slotAngle = fanAngle(index, safeCount);
        const hingeAngle = (slotAngle - initialRay) * activeFan.fan;
        const hinge = new Quaternion().setFromAxisAngle(zAxis, hingeAngle);
        const stackDepth = (index - (safeCount - 1) / 2) * 0.025;
        const hingePosition = fanAnchor.clone().sub(pivotLocal.applyQuaternion(hinge));
        hingePosition.z = stackDepth;
        const orbitPosition = coin.position.clone();
        coin.position.copy(hingePosition).lerp(orbitPosition, activeFan.orbit);
        const originalStart = coinQuaternion(index, safeCount, 0);
        const relativeTumble = originalStart.invert().multiply(coinQuaternion(index, safeCount, tumble));
        coin.quaternion.copy(hinge).multiply(relativeTumble);
      }
      coin.scale.setScalar(coin.userData.baseScale as number);
    });
  };
  return { scene, ring, coins, setTime };
}

export function applyCoinModelSlot(content: Group, slot?: CoinModelSlot) {
  content.scale.setScalar(Math.max(0.1, (slot?.scale ?? 100) / 100));
  content.rotation.set(
    (slot?.rotationX ?? 0) * Math.PI / 180,
    (slot?.rotationY ?? 0) * Math.PI / 180,
    (slot?.rotationZ ?? 0) * Math.PI / 180,
  );
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
  slots?: CoinModelSlot[];
  fan?: CoinFanSettings;
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

function primBody(usda: string, declaration: string, from = 0) {
  const start = usda.indexOf(declaration, from);
  if (start < 0) throw new Error(`USDZ 缺少 ${declaration} 节点`);
  let metadataDepth = 0;
  let open = -1;
  for (let index = start + declaration.length; index < usda.length; index += 1) {
    const character = usda[index];
    if (character === "(") metadataDepth += 1;
    else if (character === ")") metadataDepth -= 1;
    else if (character === "{" && metadataDepth === 0) {
      open = index;
      break;
    }
  }
  if (open < 0) throw new Error(`USDZ 的 ${declaration} 节点格式无效`);
  let depth = 0;
  for (let index = open; index < usda.length; index += 1) {
    if (usda[index] === "{") depth += 1;
    else if (usda[index] === "}" && --depth === 0)
      return { start, open, close: index };
  }
  throw new Error(`USDZ 的 ${declaration} 节点未闭合`);
}

function flattenThreeScene(usda: string, animationBounds: Box3) {
  // USDZExporter nests the visible scene under a sceneLibrary Scope. Freeform
  // plays direct-child xforms but keeps animated xforms below this wrapper
  // frozen, even though Keynote and Quick Look accept both layouts.
  const root = primBody(usda, 'def Xform "Root"');
  const scenes = primBody(usda, 'def Scope "Scenes"', root.open);
  const scene = primBody(usda, 'def Xform "Scene"', scenes.open);
  if (usda.slice(root.open + 1, scenes.start).trim()
    || usda.slice(scenes.close + 1, root.close).trim()
    || usda.slice(scenes.open + 1, scene.start).trim()
    || usda.slice(scene.close + 1, scenes.close).trim())
    throw new Error("USDZ 场景层级已变化，无法安全展开动画节点");
  const children = usda.slice(scene.open + 1, scene.close).replace(/^\t\t/gm, "");
  const format = (value: Vector3) => `(${value.x.toFixed(6)}, ${value.y.toFixed(6)}, ${value.z.toFixed(6)})`;
  const { minimum, maximum } = framingBounds(animationBounds);
  const extentsHint = `\n\tfloat3[] extentsHint = [${format(minimum)}, ${format(maximum)}]`;
  return `${usda.slice(0, root.start)}def Xform "Root" (\n\tkind = "component"\n)\n{${extentsHint}${children}\n}${usda.slice(root.close + 1)}`;
}

function framingBounds(animationBounds: Box3) {
  const size = animationBounds.getSize(new Vector3());
  const center = animationBounds.getCenter(new Vector3());
  const halfSide = Math.max(size.x, size.y, 0.001) * 0.6;
  const depthPadding = halfSide / 6;
  return {
    minimum: new Vector3(center.x - halfSide, center.y - halfSide, animationBounds.min.z - depthPadding),
    maximum: new Vector3(center.x + halfSide, center.y + halfSide, animationBounds.max.z + depthPadding),
  };
}

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
  const prepared = new Map<ArrayBuffer, Promise<Group>>();
  const models = await Promise.all(Array.from({ length: Math.max(1, Math.round(settings.count)) }, async (_, index) => {
    const asset = settings.slots?.[index]?.asset ?? settings.asset;
    let pending = prepared.get(asset.bytes);
    if (!pending) {
      pending = loadCoinModel(asset).then((source) => {
        const model = source.clone(true);
        if (settings.colorComp)
          compensateModelMaterials(model, settings.colorComp!, settings.emissiveLift ?? 0.5, Boolean(settings.unlit));
        return model;
      });
      prepared.set(asset.bytes, pending);
    }
    return pending;
  }));
  const { scene, ring, coins, setTime } = createCoinModelScene(
    models, settings.count, settings.coinSize, settings.spread, settings.slots,
  );
  const frames = Math.max(1, Math.round((settings.duration + settings.delay) * settings.fps));
  const times = new Float32Array(frames);
  const targets = [ring, ...coins];
  const values = targets.map(() => new Float32Array(frames * 4));
  const positions = coins.map(() => new Float32Array(frames * 3));
  const localBounds = coins.map((coin) => new Box3().setFromObject(coin.children[0].clone(true)));
  const animationBounds = new Box3();
  for (let frame = 0; frame < frames; frame += 1) {
    times[frame] = frame / settings.fps;
    setTime(Math.max(0, times[frame] - settings.delay), settings.speed, settings.ringSpeed, settings.duration, true, settings.fan);
    targets.forEach((target, index) => target.quaternion.toArray(values[index], frame * 4));
    coins.forEach((coin, index) => coin.position.toArray(positions[index], frame * 3));
    scene.updateMatrixWorld(true);
    coins.forEach((coin, index) => animationBounds.union(localBounds[index].clone().applyMatrix4(coin.matrixWorld)));
  }
  const tracks: KeyframeTrack[] = targets.map((target, index) =>
    new QuaternionKeyframeTrack(`${target.name}.quaternion`, times, values[index]));
  if (settings.fan?.enabled) coins.forEach((coin, index) => {
    tracks.push(new VectorKeyframeTrack(`${coin.name}.position`, times, positions[index]));
  });
  const clip = new AnimationClip("Coin Loader", (frames - 1) / settings.fps, tracks);
  // Freeform may frame an animated USDZ from its opening geometry and ignore
  // extentsHint. Keep a fully transparent, static mesh at the full-cycle bounds
  // so the visible cards fit without changing their animation or materials.
  const { minimum, maximum } = framingBounds(animationBounds);
  const guideSize = maximum.clone().sub(minimum);
  const framingGuide = new Mesh(
    new BoxGeometry(guideSize.x, guideSize.y, Math.max(guideSize.z, 0.001)),
    new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  framingGuide.name = "FramingGuide";
  framingGuide.position.copy(minimum).add(maximum).multiplyScalar(0.5);
  scene.add(framingGuide);
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
  const usda = flattenThreeScene(strFromU8(root), animationBounds).replace(
    /upAxis = "Y"/,
    'upAxis = "Y"\n\tplaybackMode = "loop"\n\tautoPlay = true',
  );
  const files = Object.entries(entries).map(([name, data]) => ({
    name,
    data: name === "model.usda" ? strToU8(usda) : data,
  }));
  return { bytes: packAlignedUsdz(files), frames };
}
