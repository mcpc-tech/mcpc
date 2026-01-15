/**
 * Simple Server for Native Tools Sampling
 *
 * This server acts as an "Agent" that uses the Client's LLM to solve problems.
 * It exposes a server-side tool (`calculator`) to the Client via MCP Sampling.
 *
 * Flow:
 * 1. Client calls server tool `ask-agent`.
 * 2. Server calls `generateText` (using Client's LLM).
 * 3. Server passes `calculator` tool in `generateText`.
 * 4. Client receives `calculator` tool definition in `createMessage`.
 * 5. Client (LLM) decides to call `calculator`.
 * 6. Client sends `tool_use` back to Server.
 * 7. Server executes `calculator` and sends result back.
 * 8. Client completes response.
 */

import { mcpc } from "../../core/mod.ts";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMCPSamplingProvider } from "../mod.ts";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

// 1. Create the MCP Server
const server = await mcpc(
  [{ name: "simple-server", version: "1.0.0" }, {
    capabilities: { logging: {} },
  }],
  [],
  (server) => {
    server.tool("ask-agent", `Use this tool to ask questions to the LLM`, {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask",
        },
      },
      required: ["question"],
    }, async (args: { question: string }) => {
      // Create the Sampling Provider wrapping this server
      const provider = createMCPSamplingProvider({ server });

      const result = await generateText({
        model: provider.languageModel({
          modelPreferences: { hints: [{ name: "openai/gpt-5-mini" }] },
        }),
        messages: [
          { role: "user", content: args.question },
        ],
        tools: {
          add: tool({
            description: "Add two numbers",
            inputSchema: z.object({ a: z.number(), b: z.number() }),
            execute: ({ a, b }) => {
              return a + b;
            },
          }),
        },
        stopWhen: stepCountIs(5),
      });

      server.sendLoggingMessage({
        level: "info",
        data: `Agent response: ${result.text}, tools: ${
          JSON.stringify(result.toolCalls)
        }`,
      });

      return {
        content: [{ type: "text", text: result.text }],
      } as CallToolResult;
    });
  },
);

// 4. Start the server transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("🚀 Server running on stdio");
