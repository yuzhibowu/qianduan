export type CoinModelAsset = {
  name: string;
  format: "glb" | "usdz";
  bytes: ArrayBuffer;
};

export type CoinModelSlot = {
  asset?: CoinModelAsset;
  scale: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
};

export const defaultCoinModelSlot = (): CoinModelSlot => ({
  scale: 100, rotationX: 0, rotationY: 0, rotationZ: 0,
});

export function coinModelFormat(file: Pick<File, "name">): CoinModelAsset["format"] | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "glb" || extension === "usdz" ? extension : null;
}

declare global {
  interface Window {
    __originKitCoinModels?: Record<string, CoinModelAsset>;
    __originKitCoinModelSlots?: Record<string, CoinModelSlot[]>;
  }
}
