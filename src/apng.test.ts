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

  it("stores lossless delta-frame bounds on the full animation canvas", async () => {
    const builder = new FullFrameApngBuilder(2, 30);
    await builder.addFrame(new Blob([ONE_PIXEL_PNG]), { x: 0, y: 0, canvasWidth: 4, canvasHeight: 4, blend: "source" });
    await builder.addFrame(new Blob([ONE_PIXEL_PNG]), { x: 2, y: 3, canvasWidth: 4, canvasHeight: 4, blend: "source" });
    const output = new Uint8Array(await builder.finish().arrayBuffer());
    const controls: Uint8Array[] = [];
    for (let offset = 8; offset + 12 <= output.length;) {
      const view = new DataView(output.buffer, output.byteOffset + offset);
      const length = view.getUint32(0);
      const type = String.fromCharCode(...output.subarray(offset + 4, offset + 8));
      if (type === "fcTL") controls.push(output.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    const second = new DataView(controls[1].buffer, controls[1].byteOffset, controls[1].byteLength);
    expect(second.getUint32(12)).toBe(2);
    expect(second.getUint32(16)).toBe(3);
    expect(second.getUint32(4)).toBe(1);
    expect(second.getUint32(8)).toBe(1);
  });
});
