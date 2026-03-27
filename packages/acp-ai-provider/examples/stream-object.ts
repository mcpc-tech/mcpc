/**
 * ACP Client AI Provider - Stream Object Example
 *
 * This example demonstrates how to stream structured JSON objects from
 * an ACP agent using AI SDK's `streamText` with `Output.object()`.
 *
 * In stream mode, the provider injects JSON schema instructions and
 * automatically strips markdown fences from the streamed text before
 * AI SDK parses the output.
 *
 * Prerequisites:
 * - Install Gemini CLI (if not already installed), and login gemini
 * - Run: gemini --experimental-acp
 *
 * Run with:
 * deno run --allow-all examples/stream-object.ts
 * or
 * npx tsx examples/stream-object.ts
 */

import { createACPProvider } from "../mod.ts";
import { Output, streamText } from "ai";
import { z } from "zod";
import process from "node:process";

const CityInfoSchema = z.object({
  name: z.string().describe("City name"),
  country: z.string().describe("Country name"),
  population: z.number().describe("Approximate population"),
  landmarks: z.array(z.string()).describe("Famous landmarks"),
  description: z.string().describe("Brief description of the city"),
});

async function main() {
  const provider = createACPProvider({
    command: "gemini",
    args: ["--experimental-acp"],
    env: {},
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
  });

  console.log("Streaming city info as structured JSON...\n");

  const stream = streamText({
    model: provider.languageModel(),
    prompt:
      "Tell me about Tokyo, Japan. Return structured data about the city.",
    output: Output.object({
      schema: CityInfoSchema,
    }),
  });

  // Access partial output during streaming
  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n\nFinal parsed output:");
  const output = await stream.output;
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
