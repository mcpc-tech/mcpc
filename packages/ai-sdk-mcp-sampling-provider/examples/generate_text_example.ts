/**
 * Example: Using AI SDK generateText with MCP Sampling Provider
 *
 * This example demonstrates how to use the MCP Sampling Provider
 * with AI SDK's generateText function for text generation.
 *
 * Run with:
 * deno run --allow-all examples/generate_text_example.ts
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMCPSamplingProvider } from "../mod.ts";
import { generateText } from "ai";
import { mcpc } from "../../core/mod.ts";
import type { ComposableMCPServer } from "../../core/mod.ts";

// Create a simple MCPC server with sampling capability
const server = await mcpc(
  [
    { name: "ai-sdk-example", version: "1.0.0" },
    { capabilities: { sampling: {}, tools: {} } },
  ],
  [
    {
      name: "ai-sdk-example",
      description: `I demonstrate AI SDK integration with MCP Sampling Provider.

Available tools:
<tool name="generate-greeting"/>

I can generate greetings using AI SDK's generateText function.`,
      deps: { mcpServers: {} },
      options: { sampling: true },
    },
  ],
  (server: ComposableMCPServer) => {
    // Register a simple tool that the agent can use
    server.tool(
      "generate-greeting",
      "Generate a greeting message using AI SDK",
      { type: "object", properties: {} },
      async () => {
        console.log("📝 Generating text with AI SDK...\n");

        // Create MCP sampling provider
        const provider = createMCPSamplingProvider({ server });

        // Use generateText with the provider
        const result = await generateText({
          model: provider.languageModel("copilot/gpt-5-mini"),
          prompt: "Say hello!",
        });

        // Display the results
        console.log("✅ Generated text:", result.text);
        console.log("✅ Finish reason:", result.finishReason);
        console.log("✅ Token usage:", result.usage);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
