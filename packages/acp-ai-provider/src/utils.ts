import process from "node:process";
import { debugStream } from "./debug.ts";

export function extractBase64Data(data: string): string {
  return data.includes(",") ? data.split(",")[1] : data;
}

export function logChunkToConsole(
  chunk: any,
  _options?: { debug?: boolean },
): void {
  // Kept for API compatibility. Chunk dumps follow DEBUG=acp-ai-provider:stream
  // (or acp-ai-provider:*). The unused options.debug flag is ignored.
  void _options;

  switch (chunk.type) {
    case "raw":
      debugStream("raw plan update %s", chunk.rawValue);
      break;
    case "text-delta":
      // Write directly to stdout for streaming text
      // Using process.stdout.write so callers can stream partial text
      // eslint-disable-next-line no-console
      process.stdout.write(chunk.text);
      break;
    case "tool-call":
      debugStream("tool call initiated %O", chunk.input);
      break;
    case "tool-result":
      debugStream("tool call result received %O", chunk.output);
      break;
    case "tool-error":
      debugStream("tool call error %O", chunk.error);
      break;
    case "reasoning-delta":
      debugStream("reasoning %s", chunk.text);
      break;
    default:
      debugStream("unknown chunk %O", chunk);
  }
}
