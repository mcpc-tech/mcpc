/**
 * ACP Client AI Provider - OpenCode
 *
 * This example demonstrates how to stream text responses from OpenCode
 * using ACP mode through the AI SDK.
 *
 * Prerequisites:
 * - Install OpenCode CLI (if not already installed)
 * - Run: opencode acp
 *
 * Run with:
 * deno run --allow-all examples/opencode-stream-text.ts
 * or
 * npx tsx examples/opencode-stream-text.ts
 */

import { createACPProvider } from "../mod.ts";
import { streamText } from "ai";
import process from "node:process";
import { logChunkToConsole } from "../src/utils.ts";

async function main() {
  // Create ACP provider for OpenCode
  const provider = createACPProvider({
    command: "opencode",
    args: ["acp"],
    env: {
      ...(process.env as Record<string, string>),
    },
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
  });

  const prompt = process.env.PROMPT ??
    "Run sleep 3 and then print 'Hello, OpenCode ACP!' to the console.";

  console.log({ prompt });

  const model = provider.languageModel();
  const { toolCalls } = streamText({
    model,
    prompt,
    tools: provider.tools,
    onChunk: (arg: any) => {
      const { chunk } = arg;
      logChunkToConsole(chunk);
    },
  });

  console.log(
    `Tool Calls: ${(await toolCalls).map((t: any) => t.toolName).join(", ")}`,
  );
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
