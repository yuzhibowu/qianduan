export type CoinModelAsset = {
  name: string;
  format: "glb" | "usdz";
  bytes: ArrayBuffer;
};

export function coinModelFormat(file: Pick<File, "name">): CoinModelAsset["format"] | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension === "glb" || extension === "usdz" ? extension : null;
}

declare global {
  interface Window {
    __originKitCoinModels?: Record<string, CoinModelAsset>;
  }
}
