/**
 * ACP Client AI Provider - Gemini Example
 *
 * This example demonstrates how to use Gemini with ACP mode through the AI SDK.
 *
 * Prerequisites:
 * - Install Gemini CLI (if not already installed)
 * - Run: gemini --experimental-acp
 *
 * Run with:
 * deno run --allow-all examples/basic-usage.ts
 */

import { createACPProvider } from "../mod.ts";
import { generateText } from "ai";
import process from "node:process";

async function main() {
  console.log("🚀 ACP Client AI Provider - Gemini Example\n");

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

  // Generate text using Gemini via ACP
  console.log("Asking Gemini: What is the Agent Client Protocol (ACP)?\n");

  const result = await generateText({
    model: provider.languageModel(),
    prompt:
      "What is the Agent Client Protocol (ACP)? Explain in 2-3 sentences.",
  });

  console.log("Response:", result.text);
  console.log("\nFinish reason:", result.finishReason);
  console.log("Usage:", result.usage);

  console.log("\n✅ Example completed!");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
