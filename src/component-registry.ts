import CoinLoader from "./components/CoinLoader"

export type ExportCapability = "mov" | "apng" | "usdz"

export type MotionComponentDefinition = {
  id: string
  name: string
  category: "3D" | "Text" | "Image" | "Particle"
  source: "OriginKit"
  renderer: typeof CoinLoader
  exportCapabilities: ExportCapability[]
  triggerMode: "auto"
}

export const componentRegistry: MotionComponentDefinition[] = [
  {
    id: "coin-loader",
    name: "Coin Loader",
    category: "3D",
    source: "OriginKit",
    renderer: CoinLoader,
    exportCapabilities: ["mov", "apng", "usdz"],
    triggerMode: "auto",
  },
]

export const defaultComponent = componentRegistry[0]

export function getMotionComponent(id: string) {
  return componentRegistry.find((component) => component.id === id) ?? defaultComponent
}
