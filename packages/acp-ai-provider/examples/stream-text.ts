/**
 * ACP Client AI Provider - Gemini Streaming Example
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
  console.log("🚀 ACP Client AI Provider - Gemini Streaming Example\n");

  // Create ACP provider for Gemini
  const provider = createACPProvider({
    command: "gemini",
    args: ["--experimental-acp"],
    env: {},
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
  });

  // Stream text using Gemini via ACP
  console.log("Asking Gemini to write a haiku about AI agents...\n");
  console.log("Response (streaming):");
  console.log("─".repeat(50));

  const { textStream } = streamText({
    model: provider.languageModel(),
    prompt: process.env.PROMPT ??
      "Write a beautiful haiku about AI agents helping humans.",
  });

  // Stream the response in real-time
  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n" + "─".repeat(50));
  console.log("\n✅ Streaming completed!");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
