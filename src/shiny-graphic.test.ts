import { describe, expect, it } from "vitest";
import { shinyGraphicKind, shinyGraphicLayout, type ShinyGraphic } from "./shiny-graphic";

describe("Shiny Pill graphic sources", () => {
  it("accepts only PNG and SVG file sources", () => {
    expect(shinyGraphicKind({ name: "logo.PNG", type: "" })).toBe("image/png");
    expect(shinyGraphicKind({ name: "logo.svg", type: "image/svg+xml" })).toBe("image/svg+xml");
    expect(shinyGraphicKind({ name: "photo.jpg", type: "image/jpeg" })).toBeUndefined();
  });

  it("maps the visible Alpha bounds to the whole graphic frame", () => {
    const graphic: ShinyGraphic = {
      src: "data:image/png;base64,AA==",
      name: "logo.png",
      mimeType: "image/png",
      naturalWidth: 400,
      naturalHeight: 200,
      bounds: { x: 50, y: 25, width: 300, height: 150 },
      aspect: 2,
    };
    expect(shinyGraphicLayout(graphic)).toEqual({
      width: "133.33333333333331%",
      height: "133.33333333333331%",
      left: "-16.666666666666664%",
      top: "-16.666666666666664%",
    });
  });
});
