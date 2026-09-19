import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeExportSession } from "./native-export";

vi.stubGlobal("location", { hostname: "localhost" });
const { appendNativeFrames } = await import("./native-export");

afterEach(() => vi.unstubAllGlobals());

describe("native export frame batching", () => {
  it("packs multiple PNG frames into one length-prefixed request", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const session: NativeExportSession = {
      id: "job-1",
      outputName: "test.mov",
      endpoint: "http://127.0.0.1:43987/v1",
      frameBatch: true,
    };
    const first = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const second = new Blob([new Uint8Array([4, 5])], { type: "image/png" });

    await appendNativeFrames(session, [first, second], new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:43987/v1/frames/job-1");
    const bytes = new Uint8Array(await (init?.body as Blob).arrayBuffer());
    expect(Array.from(bytes)).toEqual([0, 0, 0, 3, 1, 2, 3, 0, 0, 0, 2, 4, 5]);
  });

  it("keeps the legacy single-frame protocol for older helpers", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const session: NativeExportSession = {
      id: "job-2",
      outputName: "test.png",
      endpoint: "http://127.0.0.1:43987/v1",
      frameBatch: false,
    };

    await appendNativeFrames(
      session,
      [new Blob([new Uint8Array([1])]), new Blob([new Uint8Array([2])])],
      new AbortController().signal,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:43987/v1/frame/job-2",
      "http://127.0.0.1:43987/v1/frame/job-2",
    ]);
  });
});
