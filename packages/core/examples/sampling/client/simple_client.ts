/**
 * Simple Client for Native Tools Sampling
 *
 * This client connects to `simple_server.ts` and acts as the Host/Sampling Provider.
 * It uses a manual Mock Language Model to simulate LLM behavior, ensuring the example reliability.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CreateMessageResultWithTools } from "@modelcontextprotocol/sdk/types.js";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import {
  convertMCPToolsToAISDK,
  setupClientSampling,
} from "@mcpc/mcp-sampling-ai-provider";

// 1. Initialize MCP Client
const client = new Client(
  { name: "simple-client", version: "1.0.0" },
  { capabilities: { sampling: { tools: {} } } },
);

// 2. Setup Client Sampling Handler
setupClientSampling(client, {
  helpers: { tool, jsonSchema },
  handler: async (params) => {
    console.error("\n📡 Client handling sampling request...");

    // Convert tools
    const aiTools = convertMCPToolsToAISDK(params.tools, params.helpers);
    if (aiTools) {
      console.error(
        `   Tools available to LLM: ${Object.keys(aiTools).join(", ")}`,
      );
    }

    // Call Mock LLM
    const result = await generateText({
      system: params.systemPrompt,
      model: "openai/gpt-5-mini",
      messages: params.messages,
      tools: aiTools,
      stopWhen: stepCountIs(1),
    });

    console.log(
      "####### Model Messages #######",
      JSON.stringify(params.messages, null, 2),
      JSON.stringify(result.text, null, 2),
    );

    const tools = result.toolCalls;

    // Handle tool calls
    if (tools.length > 0) {
      const toolContentItems = tools.map((tool) => ({
        type: "tool_use",
        id: tool.toolCallId,
        name: tool.toolName,
        input: tool.input,
      }));

      console.error(
        `✅ Client requesting ${tools.length} tool call(s)`,
      );

      console.log(`####### Tool Calls from LLM #######`, toolContentItems);

      return {
        model: "mock-model",
        role: "assistant",
        content: toolContentItems.length === 1
          ? toolContentItems[0]
          : toolContentItems,
        stopReason: "toolUse",
      } as CreateMessageResultWithTools;
    }

    // Handle text response
    console.error(
      `✅ Client generation finished: ${JSON.stringify(result.text)}`,
    );

    return {
      model: "mock-model",
      role: "assistant",
      content: { type: "text", text: result.text },
      stopReason: "endTurn",
    } as CreateMessageResultWithTools;
  },
});

// 3. Connect to Server
const transport = new StdioClientTransport({
  command: "deno",
  args: ["run", "-A", "examples/sampling/01-basic-composition.ts"],
});

console.error("🔌 Connecting to server...");
await client.connect(transport);
console.error("✅ Connected.");

// 4. Trigger the flow
console.error("❓ Calling 'ask-agent' tool on server...");
try {
  const result = await client.callTool({
    name: "file-organizer",
    arguments: {
      userRequest: "List files in /Users/beet/Downloads",
      context: {},
    },
  });

  console.log("\n🏁 Final Result from Server:");
  // @ts-ignore: raw content access
  console.log(result.content[0].text);
} catch (error) {
  console.error("❌ Tool call failed:", error);
}
