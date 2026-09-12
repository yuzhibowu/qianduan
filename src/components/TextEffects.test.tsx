import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShinyPill, Typewriter } from "./TextEffects";
import type { ShinyGraphic } from "../shiny-graphic";

describe("text face rendering", () => {
  it("uses the exact face before the family fallback and applies the selected weight", () => {
    const markup = renderToStaticMarkup(
      <Typewriter
        baseColor="#fff"
        accentColor="#fff"
        speed={50}
        timeSeconds={1}
        loopDuration={12}
        background="transparent"
        text="Typography"
        fontSize={80}
        fontFamily="Demo"
        fontFace="Demo-Round"
        fontWeight={600}
      />,
    );

    expect(markup).toContain("Demo-Round");
    expect(markup).toContain("Demo");
    expect(markup).toContain("font-weight:600");
  });
});

describe("Shiny Pill graphic rendering", () => {
  it("keeps the source colors and clips the moving highlight with the same graphic", () => {
    const graphic: ShinyGraphic = {
      src: "data:image/png;base64,AA==",
      name: "mark.png",
      mimeType: "image/png",
      naturalWidth: 400,
      naturalHeight: 200,
      bounds: { x: 50, y: 25, width: 300, height: 150 },
      aspect: 2,
    };
    const markup = renderToStaticMarkup(
      <ShinyPill
        baseColor="#123456"
        accentColor="#78FF83"
        speed={1.5}
        timeSeconds={0.75}
        loopDuration={1.5}
        background="transparent"
        text="SHOULD NOT RENDER"
        shinyGraphic={graphic}
        shinyGraphicScale={100}
      />,
    );

    expect(markup).toContain('src="data:image/png;base64,AA=="');
    expect(markup).toContain("shiny-graphic-sweep-mask");
    expect(markup).toContain("background-color:#78FF83");
    expect(markup).not.toContain("SHOULD NOT RENDER");
    expect(markup).not.toContain("#123456");
  });
});
