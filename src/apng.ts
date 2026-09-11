const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();

function uint32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}

function uint16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value);
  return bytes;
}

function join(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array) {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const name = encoder.encode(type);
  return join([uint32(data.length), name, data, uint32(crc32(join([name, data])))]);
}

function inspectPng(bytes: Uint8Array) {
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error("导出帧不是有效 PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ancillary: Uint8Array[] = [];
  const imageData: Uint8Array[] = [];
  let ihdr: Uint8Array | undefined;
  let offset = 8;
  let reachedImage = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === "IHDR") ihdr = data;
    else if (type === "IDAT") {
      reachedImage = true;
      imageData.push(data);
    } else if (type !== "IEND" && !reachedImage) ancillary.push(chunk(type, data));
    offset += length + 12;
  }
  if (!ihdr || imageData.length === 0) throw new Error("PNG 帧缺少图像数据");
  return { ihdr, ancillary, imageData: join(imageData) };
}

function frameControl(sequence: number, width: number, height: number, fps: number) {
  return join([
    uint32(sequence), uint32(width), uint32(height), uint32(0), uint32(0),
    uint16(1), uint16(Math.max(1, Math.min(65535, Math.round(fps)))),
    new Uint8Array([0, 0]),
  ]);
}

export async function buildFullFrameApng(frames: Blob[], fps: number) {
  if (frames.length === 0) throw new Error("没有可编码的 PNG 帧");
  const parsed = await Promise.all(frames.map(async (frame) => inspectPng(new Uint8Array(await frame.arrayBuffer()))));
  const first = parsed[0];
  const view = new DataView(first.ihdr.buffer, first.ihdr.byteOffset, first.ihdr.byteLength);
  const width = view.getUint32(0);
  const height = view.getUint32(4);
  const output: Uint8Array[] = [SIGNATURE, chunk("IHDR", first.ihdr), ...first.ancillary, chunk("acTL", join([uint32(frames.length), uint32(0)]))];
  let sequence = 0;
  parsed.forEach((frame, index) => {
    output.push(chunk("fcTL", frameControl(sequence++, width, height, fps)));
    if (index === 0) output.push(chunk("IDAT", frame.imageData));
    else output.push(chunk("fdAT", join([uint32(sequence++), frame.imageData])));
  });
  output.push(chunk("IEND", new Uint8Array()));
  return join(output);
}
