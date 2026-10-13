import { describe, expect, it } from "vitest";
import { appleProResVendor } from "./apple-prores";

function atom(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(data.length + 8);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  return bytes;
}

describe("Apple ProRes container vendor", () => {
  it("changes only the ProRes sample-entry vendor and preserves encoded media", () => {
    const payload = new Uint8Array(78);
    payload.set(new TextEncoder().encode("FFMP"), 12);
    const sample = atom("ap4x", payload);
    const fullBox = new Uint8Array(8 + sample.length);
    new DataView(fullBox.buffer).setUint32(4, 1);
    fullBox.set(sample, 8);
    let metadata = atom("stsd", fullBox);
    for (const type of ["stbl", "minf", "mdia", "trak", "moov"]) metadata = atom(type, metadata);
    const media = atom("mdat", new TextEncoder().encode("encoded FFMP samples"));
    const file = new Uint8Array(metadata.length + media.length);
    file.set(metadata);
    file.set(media, metadata.length);
    const original = file.slice();
    const vendor = new TextDecoder().decode(file).indexOf("FFMP");
    expect(appleProResVendor(file)).toBe(file);
    original.set(new TextEncoder().encode("apl0"), vendor);
    expect(file).toEqual(original);
    expect(appleProResVendor(file)).toEqual(original);
  });

  it("leaves malformed atoms and non-ProRes data unchanged", () => {
    for (const file of [new Uint8Array([0, 0, 0]), atom("mdat", new TextEncoder().encode("FFMP"))]) {
      const original = file.slice();
      expect(appleProResVendor(file)).toEqual(original);
    }
  });
});
