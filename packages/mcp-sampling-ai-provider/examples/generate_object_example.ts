/**
 * Example: Using AI SDK generateObject with MCP Sampling Provider
 *
 * This example demonstrates how to use the MCP Sampling Provider
 * with AI SDK's generateObject function for structured data generation.
 *
 * Run with:
 * deno run --allow-all examples/generate_object_example.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createMCPSamplingProvider } from "../mod.ts";
import { generateObject } from "ai";
import { z } from "zod";

// Create a simple MCP server with sampling capability
const server = new Server(
  { name: "ai-sdk-example", version: "1.0.0" },
  { capabilities: { sampling: {}, tools: {} } },
);

// Register a tool that generates structured data
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      {
        name: "generate-recipe",
        description: "Generate a structured recipe object using AI SDK",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "generate-recipe") {
    console.log("🍳 Generating structured object with AI SDK...\n");

    // Create MCP sampling provider
    const provider = createMCPSamplingProvider({ server });

    // Define the schema for the recipe object
    const recipeSchema = z.object({
      recipe: z.object({
        name: z.string(),
        cuisine: z.string(),
        difficulty: z.enum(["easy", "medium", "hard"]),
        prepTime: z.string(),
        cookTime: z.string(),
        servings: z.number(),
        ingredients: z.array(z.string()),
        steps: z.array(z.string()),
        tips: z.array(z.string()).optional(),
      }),
    });

    // Use generateObject with the provider
    const result = await generateObject({
      mode: "json",
      model: provider.languageModel({
        modelPreferences: { hints: [{ name: "copilot/gpt-5-mini" }] },
      }),
      schema: recipeSchema,
      prompt: "Generate a delicious lasagna recipe.",
    });

    // Display the results
    console.log("✅ Generated object:");
    console.log(JSON.stringify(result.object, null, 2));
    console.log("\n✅ Finish reason:", result.finishReason);
    console.log("✅ Token usage:", result.usage);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
