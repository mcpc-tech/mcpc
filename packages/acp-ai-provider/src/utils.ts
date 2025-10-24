import process from "node:process";

export function extractBase64Data(data: string): string {
  return data.includes(",") ? data.split(",")[1] : data;
}

export function logChunkToConsole(chunk: any): void {
  switch (chunk.type) {
    case "raw":
      // eslint-disable-next-line no-console
      console.log(`\n[Raw Plan Update]: ${chunk.rawValue}`);
      break;
    case "text-delta":
      // Write directly to stdout for streaming text
      // Using process.stdout.write so callers can stream partial text
      // eslint-disable-next-line no-console
      process.stdout.write(chunk.text);
      break;
    case "tool-call":
      // eslint-disable-next-line no-console
      console.log(
        `\n[Tool Call Initiated]`,
        JSON.stringify(chunk.input, null, 2),
      );
      break;
    case "tool-result":
      // eslint-disable-next-line no-console
      console.log(
        `\n[Tool Call Result Received]`,
        JSON.stringify(chunk.output, null, 2),
      );
      break;
    case "tool-error":
      console.log(
        `\n[Tool Call Error]`,
        JSON.stringify(chunk.error, null, 2),
      );
      break;
    case "reasoning-delta":
      // eslint-disable-next-line no-console
      process.stdout.write(`\n[Reasoning]: ${chunk.text}`);
      break;
    default:
      // Unknown chunk type: log it for debugging
      // eslint-disable-next-line no-console
      console.log("\n[Unknown chunk]:", JSON.stringify(chunk, null, 2));
  }
}
