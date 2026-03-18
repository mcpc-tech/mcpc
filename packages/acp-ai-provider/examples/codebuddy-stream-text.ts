/**
 * ACP Client AI Provider (CodeBuddy)
 *
 * A minimal streaming example with provider-level lazy auth.
 *
 * Prerequisites:
 * - Install CodeBuddy CLI and log in
 * - Run: codebuddy --acp
 * - Optional: set AUTH_METHOD_ID (default: iOA)
 *
 * Run with:
 * deno run --allow-all examples/codebuddy-stream-text.ts
 * or
 * npx tsx examples/codebuddy-stream-text.ts
 */

import { createACPProvider } from "../mod.ts";
import { streamText } from "ai";
import process from "node:process";

async function main() {
  const provider = createACPProvider({
    command: "codebuddy",
    args: ["--acp"],
    env: {},
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
  });

  const prompt = process.env.PROMPT ??
    "Write a beautiful haiku about AI agents helping humans.";

  console.log({ prompt });

  const { textStream } = streamText({
    model: provider.languageModel(),
    prompt,
  });

  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }

  process.stdout.write("\n");
}

main().catch((error: unknown) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
