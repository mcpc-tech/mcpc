/**
 * Example: Using AI SDK generateText with MCP Sampling Provider
 *
 * This example demonstrates how to use the MCP Sampling Provider
 * with AI SDK's generateText function for text generation.
 *
 * Run with:
 * deno run --allow-all examples/generate_text_example.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createMCPSamplingProvider } from "../mod.ts";
import { generateText, stepCountIs } from "ai";
import { z } from "zod";

// Create a simple MCP server with sampling capability
const server = new Server(
  { name: "ai-sdk-example", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// Register tools
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      {
        name: "generate-greeting",
        description: "Generate a greeting message using AI SDK",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "test-tool-calls",
        description: "Test tool calling functionality with AI SDK",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "generate-greeting") {
    console.log("📝 Generating text with AI SDK...\n");

    // Create MCP sampling provider
    const provider = createMCPSamplingProvider({ server });

    // Use generateText with the provider
    const result = await generateText({
      model: provider.languageModel({
        modelPreferences: { hints: [{ name: "copilot/gpt-5-mini" }] },
      }),
      prompt: "Say hello!",
    });

    // Display the results
    console.log("✅ Generated text:", result.text);
    console.log("✅ Finish reason:", result.finishReason);
    console.log("✅ Token usage:", result.usage);

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  if (request.params.name === "test-tool-calls") {
    console.log("🔧 Testing tool calls with AI SDK...\n");

    // Create MCP sampling provider
    const provider = createMCPSamplingProvider({ server });

    const result = await generateText({
      model: provider.languageModel({
        modelPreferences: { hints: [{ name: "copilot/gpt-5-mini" }] },
      }),
      stopWhen: stepCountIs(5),
      prompt:
        "Calculate 25 + 17 using the calculator tool, then explain the result.",
      tools: {
        calculator: {
          description: "Perform mathematical calculations",
          inputSchema: z.object({
            operation: z
              .enum(["add", "subtract", "multiply", "divide"])
              .describe("The math operation to perform"),
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
          }),
          execute: (params: { operation: string; a: number; b: number }) => {
            console.log("Calculator tool called with params:", params);
            switch (params.operation) {
              case "add":
                return { result: params.a + params.b };
              case "subtract":
                return { result: params.a - params.b };
              case "multiply":
                return { result: params.a * params.b };
              case "divide":
                return { result: params.a / params.b };
              default:
                throw new Error("Unsupported operation");
            }
          },
        },
      },
    });

    // Display the results
    console.log("\n✅ Generated response:");
    console.log(result.text);
    console.log("\n✅ Finish reason:", result.finishReason);
    console.log("✅ Token usage:", result.usage);
    console.log(
      "✅ Steps:",
      JSON.stringify(result.steps, null, 2),
      result.toolCalls,
      result,
    );
    console.log("✅ Tool results:", result.toolResults);

    return {
      content: [
        {
          type: "text",
          text: `Result: ${result.text}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
