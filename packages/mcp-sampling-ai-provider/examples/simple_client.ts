/**
 * Simple Client for Native Tools Sampling
 *
 * This client connects to `simple_server.ts` and acts as the Host/Sampling Provider.
 * It uses a manual Mock Language Model to simulate LLM behavior, ensuring the example reliability.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { convertMCPToolsToAISDK, setupClientSampling } from "../mod.ts";
import { generateText, jsonSchema, tool } from "ai";
import { fileURLToPath } from "node:url";

const DEBUG = true;

// 1. Initialize MCP Client
const client = new Client(
  { name: "simple-client", version: "1.0.0" },
  {
    capabilities: {
      sampling: {
        tools: {},
      },
    },
  },
);

// 2. Setup Client Sampling Handler
setupClientSampling(client, {
  helpers: { tool, jsonSchema },
  handler: async (params) => {
    // Convert tools
    const aiTools = convertMCPToolsToAISDK(params.tools, params.helpers);

    // Call Mock LLM
    const result = await generateText({
      system: params.systemPrompt,
      model: "openai/gpt-5-mini",
      messages: params.messages,
      tools: aiTools,
    });

    const content = [];
    if (result.text) {
      content.push({ type: "text" as const, text: result.text });
    }
    content.push(...result.toolCalls.map((toolCall) => ({
      type: "tool_use" as const,
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      input: toolCall.input as { [x: string]: unknown },
    })));

    if (DEBUG) console.log("result", result);

    return {
      model: "openai/gpt-5-mini",
      role: "assistant" as const,
      content,
      stopReason: "endTurn",
    };
  },
});

// 3. Connect to Server
const simpleServerPath = fileURLToPath(
  new URL("./simple_server.ts", import.meta.url),
);

const transport = new StdioClientTransport({
  command: "deno",
  args: [
    "run",
    "-A",
    simpleServerPath,
  ],
});

await client.connect(transport);
await client.setLoggingLevel(DEBUG ? "debug" : "info");

if (DEBUG) {
  client.setNotificationHandler(
    LoggingMessageNotificationSchema,
    (notification) => {
      console.log(
        `[mcp_log ${notification.params.level}]: ${notification.params.data}`,
      );
    },
  );
}

// 4. Trigger the flow
try {
  const result = await client.callTool({
    name: "ask-agent",
    arguments: {
      question:
        "What is 15 + 27? You MUST use the 'add' tool and report back whether the tool is called or not.",
    },
  });

  console.log(result.content);
} catch (error) {
  console.error("❌ Tool call failed:", error);
} finally {
  await client.close();
}
