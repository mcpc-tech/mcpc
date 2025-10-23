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
    onChunk: ({ chunk }) => {
      // Optional: Handle each chunk as it arrives
      switch (chunk.type) {
        case "text-delta":
          process.stdout.write(chunk.text);
          break;
        case "tool-call":
          console.log(
            `\n[Tool Call Initiated: ${chunk.toolCallId} - ${chunk.toolName}]`,
            JSON.stringify(chunk.input, null, 2),
          );
          break;
        case "tool-result":
          console.log(
            `\n[Tool Call Result Received: ${chunk.toolCallId}]`,
            JSON.stringify(chunk.output, null, 2),
          );
          break;
        case "reasoning-delta":
          process.stdout.write(`\n[Reasoning]: ${chunk.text}`);
          break;
      }
    },
  });

  console.log("\n" + "─".repeat(50));
  console.log("\n✅ Streaming completed!");
  console.log(
    `Tool Calls: ${(await toolCalls).map((t) => t.toolName).join(", ")}`,
  );
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
