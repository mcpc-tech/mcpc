/**
 * ACP Client AI Provider
 *
 * This example demonstrates how to stream text responses from OpenCode
 * using ACP mode through the AI SDK.
 *
 * Prerequisites:
 * - Install OpenCode CLI: npm install -g @opencode/cli (or follow https://opencode.ai/docs/installation)
 * - Set OPENCODE_API_KEY environment variable
 * - Run: opencode acp
 *
 * Run with:
 * deno run --allow-all examples/opencode-stream-text.ts
 * or
 * npx tsx examples/opencode-stream-text.ts
 */

import { acpTools, createACPProvider } from "../mod.ts";
import { streamText, tool } from "ai";
import { z } from "zod";
import process from "node:process";
import { logChunkToConsole } from "../src/utils.ts";

async function main() {
  // Create ACP provider for OpenCode
  const provider = createACPProvider({
    command: "opencode",
    args: ["acp"],
    env: {
      OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
    },
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
  });

  const prompt = process.env.PROMPT ??
    "Write a beautiful haiku about AI agents helping humans.";

  console.log({ prompt });

  const { toolCalls } = streamText({
    model: provider.languageModel(),
    prompt,
    tools: acpTools({
      hello: tool({
        description: `Say hello`,
        inputSchema: z.object({}),
        execute: () => {
          return `Hello`;
        },
      }),
    }),
    onChunk: (arg: any) => {
      const { chunk } = arg;
      logChunkToConsole(chunk);
    },
  });

  console.log(
    `Tool Calls: ${(await toolCalls).map((t) => t.toolName).join(", ")}`,
  );
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
