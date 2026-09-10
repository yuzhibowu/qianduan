import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Slider from "./Slider";

describe("Slider reset affordance", () => {
  it("keeps the existing field heading element while making it an accessible reset control", () => {
    const markup = renderToStaticMarkup(
      <Slider label="圆环数量" value={7} min={2} max={14} onChange={() => undefined} />,
    );
    expect(markup).toContain("aria-label=\"圆环数量，恢复默认值\"");
    expect(markup).toContain("title=\"恢复默认值\"");
    expect(markup).toContain("class=\"slider-head slider-reset\"");
    expect(markup).toContain("type=\"button\"");
  });
});
