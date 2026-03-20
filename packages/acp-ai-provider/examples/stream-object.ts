/**
 * ACP Client AI Provider - Stream Object Example
 *
 * This example demonstrates how to stream structured JSON objects from
 * an ACP agent using AI SDK's `streamText` with `experimental_output`.
 *
 * Note: In AI SDK v5, structured output via `generateText`/`streamText` is
 * experimental — use `experimental_output` instead of `output`.
 * The `streamObject` function is also available as a stable alternative.
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
    // In AI SDK v5, structured output is experimental
    experimental_output: Output.object({
      schema: CityInfoSchema,
    }),
  });

  // Stream partial objects as they arrive
  console.log("Partial outputs:");
  for await (const partial of stream.experimental_partialOutputStream) {
    console.log(JSON.stringify(partial));
  }

  // Get the final text (already fence-stripped by the provider)
  const text = await stream.text;
  console.log("\n\nFinal parsed output:");
  console.log(JSON.stringify(JSON.parse(text), null, 2));
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
