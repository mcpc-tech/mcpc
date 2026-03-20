/**
 * ACP Client AI Provider - Generate Object Example
 *
 * This example demonstrates how to generate structured JSON objects from
 * an ACP agent using AI SDK's `generateText` with `experimental_output`.
 *
 * Note: In AI SDK v5, structured output via `generateText`/`streamText` is
 * experimental — use `experimental_output` instead of `output`.
 * The `generateObject` function is also available as a stable alternative.
 *
 * The ACP provider injects JSON schema instructions into the prompt,
 * asking the agent to respond with pure JSON. Markdown fences are
 * automatically stripped if the agent wraps the output.
 *
 * Prerequisites:
 * - Install Gemini CLI (if not already installed), and login gemini
 * - Run: gemini --experimental-acp
 *
 * Run with:
 * deno run --allow-all examples/generate-object.ts
 * or
 * npx tsx examples/generate-object.ts
 */

import { createACPProvider } from "../mod.ts";
import { generateText, Output } from "ai";
import { z } from "zod";
import process from "node:process";

const RecipeSchema = z.object({
  name: z.string().describe("The name of the recipe"),
  ingredients: z.array(
    z.object({
      item: z.string(),
      amount: z.string(),
    }),
  ).describe("List of ingredients with amounts"),
  steps: z.array(z.string()).describe("Cooking steps"),
  prepTimeMinutes: z.number().describe("Preparation time in minutes"),
  servings: z.number().describe("Number of servings"),
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

  console.log("Generating a recipe as structured JSON...\n");

  const result = await generateText({
    model: provider.languageModel(),
    prompt:
      "Give me a recipe for chocolate chip cookies. Return it as structured data.",
    // In AI SDK v5, structured output is experimental
    experimental_output: Output.object({
      schema: RecipeSchema,
    }),
  });

  console.log("Generated object:");
  console.log(JSON.stringify(result.experimental_output, null, 2));

  console.log("\nRaw text:");
  console.log(result.text);
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
