import { describe, expect, it } from "vitest";
import { buildFullFrameApng } from "./apng";

const ONE_PIXEL_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Av6vWQAAAABJRU5ErkJggg=="), (char) => char.charCodeAt(0));

describe("full-frame APNG", () => {
  it("writes full canvas frame controls instead of cropped delta frames", async () => {
    const output = await buildFullFrameApng([new Blob([ONE_PIXEL_PNG]), new Blob([ONE_PIXEL_PNG])], 30);
    const text = String.fromCharCode(...output);
    expect(text.match(/fcTL/g)).toHaveLength(2);
    expect(text).toContain("acTL");
    expect(text).toContain("fdAT");
  });
});
