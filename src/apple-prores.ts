// Normalize only the QuickTime ProRes sample-entry vendor field. Encoded
// samples and all other metadata must remain byte-for-byte unchanged.
export function appleProResVendor(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const typeAt = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl"]);
  const proResTypes = new Set(["apco", "apcs", "apcn", "apch", "ap4h", "ap4x"]);
  const walk = (start: number, end: number, sampleEntries = false) => {
    for (let offset = start; offset + 8 <= end;) {
      let size = view.getUint32(offset);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) return;
        const extended = view.getBigUint64(offset + 8);
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) return;
        size = Number(extended);
        header = 16;
      } else if (size === 0) size = end - offset;
      if (size < header || offset + size > end) return;
      const type = typeAt(offset + 4);
      if (sampleEntries && proResTypes.has(type) && size >= header + 16) {
        bytes.set([0x61, 0x70, 0x6c, 0x30], offset + header + 12);
      } else if (containers.has(type)) {
        walk(offset + header, offset + size);
      } else if (type === "stsd" && size >= header + 8) {
        walk(offset + header + 8, offset + size, true);
      }
      offset += size;
    }
  };
  walk(0, bytes.length);
  return bytes;
}
