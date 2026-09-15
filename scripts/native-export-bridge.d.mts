import type { IncomingMessage, ServerResponse } from "node:http";

export declare function nativeExportBridge(): (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => Promise<void>;
