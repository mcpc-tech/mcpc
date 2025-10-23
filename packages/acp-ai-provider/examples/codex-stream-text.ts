/**
 * ACP Client AI Provider
 *
 * This example demonstrates how to stream text responses from Gemini
 * using ACP mode through the AI SDK.
 *
 * Prerequisites:
 * - Install Gemini CLI (if not already installed)
 * - Run: gemini --experimental-acp
 *
 * Run with:
 * deno run --allow-all examples/stream-text.ts
 * or
 * npx tsx examples/stream-text.ts
 */

import { createACPProvider } from "../mod.ts";
import { streamText } from "ai";
import process from "node:process";
import { logChunkToConsole } from "../src/utils.ts";

async function main() {
  // Create ACP provider for Gemini
  const provider = createACPProvider({
    command: "codex-acp",
    env: {
      ...(process.env as Record<string, string>),
    },
    authMethodId: "custom-model-provider",
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
  });

  const prompt = process.env.PROMPT ??
    "Write a beautiful haiku about AI agents helping humans.";

  console.log({ prompt });

  const model = provider.languageModel();
  const { toolCalls } = streamText({
    model,
    prompt,
    tools: model.tools,
    onChunk: (arg: any) => {
      const { chunk } = arg;
      logChunkToConsole(chunk);
    },
  });

  console.log("\n" + "─".repeat(50));
  console.log("\n✅ Streaming completed!");
  console.log(
    `Tool Calls: ${(await toolCalls).map((t: any) => t.toolName).join(", ")}`,
  );
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
