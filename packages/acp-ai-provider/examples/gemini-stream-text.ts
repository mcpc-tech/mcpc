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
    command: "gemini",
    args: ["--experimental-acp"],
    env: {},
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
    authMethodId: "gemini-api-key",
  });

  const prompt = process.env.PROMPT ??
    "Write a beautiful haiku about AI agents helping humans.";

  console.log({ prompt });
  console.log("Response (streaming):");
  console.log("─".repeat(50));

  const { textStream, toolCalls } = streamText({
    model: provider.languageModel(),
    prompt,
  });

  // Stream the response in real-time
  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }

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
