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
function crc32Parts(parts: Uint8Array[]) {
  crcTable ??= Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  let crc = 0xffffffff;
  for (const bytes of parts)
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunkParts(type: string, data: Uint8Array) {
  const name = encoder.encode(type);
  return [uint32(data.length), name, data, uint32(crc32Parts([name, data]))];
}

function inspectPng(bytes: Uint8Array) {
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error("导出帧不是有效 PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ancillary: Array<{ type: string; data: Uint8Array }> = [];
  const imageData: Uint8Array[] = [];
  let ihdr: Uint8Array | undefined;
  let offset = 8;
  let reachedImage = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") ihdr = data;
    else if (type === "IDAT") {
      reachedImage = true;
      imageData.push(data);
    } else if (type !== "IEND" && !reachedImage) ancillary.push({ type, data });
    offset += length + 12;
  }
  if (!ihdr || imageData.length === 0) throw new Error("PNG 帧缺少图像数据");
  return { ihdr, ancillary, imageData };
}

function frameControl(sequence: number, width: number, height: number, fps: number) {
  return join([
    uint32(sequence), uint32(width), uint32(height), uint32(0), uint32(0),
    uint16(1), uint16(Math.max(1, Math.min(65535, Math.round(fps)))),
    new Uint8Array([0, 0]),
  ]);
}

export class FullFrameApngBuilder {
  private readonly parts: Uint8Array[] = [SIGNATURE];
  private sequence = 0;
  private addedFrames = 0;
  private width = 0;
  private height = 0;
  private finished = false;

  constructor(
    private readonly expectedFrames: number,
    private readonly fps: number,
  ) {
    if (expectedFrames < 1) throw new Error("没有可编码的 PNG 帧");
  }

  private pushChunk(type: string, data: Uint8Array) {
    this.parts.push(...chunkParts(type, data));
  }

  async addFrame(frame: Blob, region?: { x: number; y: number; canvasWidth: number; canvasHeight: number; blend: "source" | "over" }) {
    if (this.finished) throw new Error("PNG 动图已经结束编码");
    if (this.addedFrames >= this.expectedFrames) throw new Error("PNG 动图帧数超出预期");
    const parsed = inspectPng(new Uint8Array(await frame.arrayBuffer()));
    const view = new DataView(parsed.ihdr.buffer, parsed.ihdr.byteOffset, parsed.ihdr.byteLength);
    const width = view.getUint32(0);
    const height = view.getUint32(4);
    const canvasWidth = region?.canvasWidth ?? width;
    const canvasHeight = region?.canvasHeight ?? height;
    if (this.addedFrames === 0) {
      this.width = canvasWidth;
      this.height = canvasHeight;
      const canvasHeader = parsed.ihdr.slice();
      new DataView(canvasHeader.buffer, canvasHeader.byteOffset, canvasHeader.byteLength).setUint32(0, canvasWidth);
      new DataView(canvasHeader.buffer, canvasHeader.byteOffset, canvasHeader.byteLength).setUint32(4, canvasHeight);
      this.pushChunk("IHDR", canvasHeader);
      parsed.ancillary.forEach(({ type, data }) => this.pushChunk(type, data));
      this.pushChunk("acTL", join([uint32(this.expectedFrames), uint32(0)]));
    } else if (canvasWidth !== this.width || canvasHeight !== this.height) {
      throw new Error("PNG 动图的画布尺寸必须一致");
    }
    const control = frameControl(this.sequence++, width, height, this.fps);
    new DataView(control.buffer, control.byteOffset, control.byteLength).setUint32(12, region?.x ?? 0);
    new DataView(control.buffer, control.byteOffset, control.byteLength).setUint32(16, region?.y ?? 0);
    control[25] = region?.blend === "over" ? 1 : 0;
    this.pushChunk("fcTL", control);
    if (this.addedFrames === 0) {
      parsed.imageData.forEach((data) => this.pushChunk("IDAT", data));
    } else {
      parsed.imageData.forEach((data) =>
        this.pushChunk("fdAT", join([uint32(this.sequence++), data])),
      );
    }
    this.addedFrames += 1;
  }

  finish() {
    if (this.finished) throw new Error("PNG 动图已经结束编码");
    if (this.addedFrames !== this.expectedFrames) {
      throw new Error(`PNG 动图缺少帧：${this.addedFrames}/${this.expectedFrames}`);
    }
    this.finished = true;
    this.pushChunk("IEND", new Uint8Array());
    return new Blob(this.parts as BlobPart[], { type: "image/png" });
  }
}

export async function buildFullFrameApng(frames: Blob[], fps: number) {
  const builder = new FullFrameApngBuilder(frames.length, fps);
  for (const frame of frames) await builder.addFrame(frame);
  return new Uint8Array(await builder.finish().arrayBuffer());
}
