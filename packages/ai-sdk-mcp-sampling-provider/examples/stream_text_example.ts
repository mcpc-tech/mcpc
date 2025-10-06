/**
 * Example: Using AI SDK streamText with MCP Sampling Provider
 *
 * This example demonstrates how to use the MCP Sampling Provider
 * with AI SDK's streamText function for streaming text generation.
 *
 * Run with:
 * deno run --allow-all examples/stream_text_example.ts
 */

import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMCPSamplingProvider } from "../mod.ts";
import { stepCountIs, streamText } from "ai";
import { z } from "zod";
import { mcpc } from "../../core/mod.ts";
import type { ComposableMCPServer } from "../../core/mod.ts";

// Create a simple MCPC server with sampling capability
const server = await mcpc(
  [
    { name: "ai-sdk-example", version: "1.0.0" },
    { capabilities: { sampling: {}, tools: {} } },
  ],
  [],
  (server: ComposableMCPServer) => {
    // Register a simple tool that streams text
    server.tool(
      "stream-greeting",
      "Stream a greeting message using AI SDK",
      { type: "object", properties: {} },
      async () => {
        console.log("📝 Streaming text with AI SDK...\n");

        // Create MCP sampling provider
        const provider = createMCPSamplingProvider({ server });

        // Use streamText with the provider
        const result = streamText({
          model: provider.languageModel("copilot/gpt-5-mini"),
          prompt: "Write a short poem about coding.",
        });

        // Stream the text chunks
        console.log("✅ Streaming response:");
        for await (const chunk of result.textStream) {
          process.stdout.write(chunk);
        }
        console.log("\n");

        // Display final results after streaming completes
        console.log("\n✅ Finish reason:", await result.finishReason);
        console.log("✅ Token usage:", await result.usage);

        return {
          content: [{ type: "text", text: await result.text }],
        };
      },
    );

    // Register a tool that tests tool calling with streaming
    server.tool(
      "stream-with-tools",
      "Stream text generation with tool calls",
      { type: "object", properties: {} },
      async () => {
        console.log("🔧 Testing streaming with tool calls...\n");

        // Create MCP sampling provider
        const provider = createMCPSamplingProvider({ server });

        // Stream with tools
        const result = streamText({
          model: provider.languageModel("copilot/gpt-5-mini"),
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
              execute: (params: {
                operation: string;
                a: number;
                b: number;
              }) => {
                console.log(
                  `\n🔢 Executing calculator: ${params.operation}(${params.a}, ${params.b})`,
                );
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

        // Stream the text chunks and collect tool info
        console.log("\n✅ Streaming response:");
        let chunkCount = 0;
        const collectedToolCalls: any[] = [];
        const collectedToolResults: any[] = [];

        for await (const chunk of result.fullStream) {
          chunkCount++;
          console.log(`Chunk ${chunkCount}:`, JSON.stringify(chunk));

          // Collect tool calls
          if (chunk.type === "tool-call") {
            collectedToolCalls.push(chunk);
          }

          // Collect tool results
          if (chunk.type === "tool-result") {
            collectedToolResults.push(chunk);
          }
        }

        console.log(`\n📊 Total chunks received: ${chunkCount}`);

        // Display collected tool calls
        if (collectedToolCalls.length > 0) {
          console.log("\n📋 Tool Calls:");
          for (const call of collectedToolCalls) {
            console.log(`  - ${call.toolName}:`, JSON.stringify(call.input));
          }
        }

        // Display collected tool results
        if (collectedToolResults.length > 0) {
          console.log("\n📊 Tool Results:");
          for (const toolResult of collectedToolResults) {
            console.log(
              `  - ${toolResult.toolName}:`,
              JSON.stringify(toolResult.output),
            );
          }
        }

        // Display final results
        console.log("\n✅ Finish reason:", await result.finishReason);
        console.log("✅ Token usage:", await result.usage);

        const finalText = await result.text;

        return {
          content: [
            {
              type: "text",
              text: `Results:\n` +
                `- Text: ${finalText || "(no text generated)"}\n` +
                `- Tool calls: ${collectedToolCalls.length}\n` +
                `- Tool results: ${collectedToolResults.length}\n` +
                `- Finish reason: ${await result.finishReason}`,
            },
          ],
        };
      },
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
