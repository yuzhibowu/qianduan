import { describe, expect, it } from "vitest";
import { buildFullFrameApng, FullFrameApngBuilder } from "./apng";

const ONE_PIXEL_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av6vWQAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));

describe("full-frame APNG", () => {
  it("writes full canvas frame controls instead of cropped delta frames", async () => {
    const output = await buildFullFrameApng([new Blob([ONE_PIXEL_PNG]), new Blob([ONE_PIXEL_PNG])], 30);
    const text = String.fromCharCode(...output);
    expect(text.match(/fcTL/g)).toHaveLength(2);
    expect(text).toContain("acTL");
    expect(text).toContain("fdAT");
  });

  it("accepts frames incrementally without retaining the source Blob array", async () => {
    const builder = new FullFrameApngBuilder(2, 30);
    await builder.addFrame(new Blob([ONE_PIXEL_PNG]));
    await builder.addFrame(new Blob([ONE_PIXEL_PNG]));
    const output = new Uint8Array(await builder.finish().arrayBuffer());
    const text = String.fromCharCode(...output);
    expect(text.match(/fcTL/g)).toHaveLength(2);
    expect(text).toContain("fdAT");
  });
});
