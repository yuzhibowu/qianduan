import type { BorderRendererProps } from "./BorderComponents";
import PaperImage from "./originkit/PaperImage";

export type PaperImageSettings = {
  image: string;
  cardWidth: number;
  cardHeight: number;
  mode: "Wave" | "Lift";
  hoverLift: number;
  restLift: number;
  depth: number;
  sheen: number;
};

export const DEFAULT_PAPER_IMAGE: PaperImageSettings = {
  image: "https://images.unsplash.com/photo-1767474256862-65bb792c69fb?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NjF8fHZpYnJhbnQlMjBpbWFnZXN8ZW58MHwxfDB8fHwy",
  cardWidth: 340,
  cardHeight: 440,
  mode: "Wave",
  hoverLift: 100,
  restLift: 60,
  depth: 40,
  sheen: 35,
};

export default function PaperImageRenderer({
  timeSeconds,
  interactionTrack = [],
  paperImage,
}: BorderRendererProps & { paperImage?: Partial<PaperImageSettings> }) {
  const settings = { ...DEFAULT_PAPER_IMAGE, ...paperImage };
  return (
    <div className="motion-root paper-image-root">
      <PaperImage
        image={settings.image}
        cardWidth={settings.cardWidth}
        cardHeight={settings.cardHeight}
        mode={settings.mode}
        hoverLift={settings.hoverLift}
        restLift={settings.restLift}
        depth={settings.depth}
        sheen={settings.sheen}
        timeSeconds={timeSeconds}
        interactionTrack={interactionTrack}
      />
    </div>
  );
}
