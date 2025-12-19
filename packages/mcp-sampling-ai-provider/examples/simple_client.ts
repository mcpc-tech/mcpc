/**
 * Simple Client for Native Tools Sampling
 *
 * This client connects to `simple_server.ts` and acts as the Host/Sampling Provider.
 * It uses a manual Mock Language Model to simulate LLM behavior, ensuring the example reliability.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { convertMCPToolsToAISDK, setupClientSampling } from "../mod.ts";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";

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
      model: "openai/gpt-5-mini",
      messages: params.messages,
      tools: aiTools,
      stopWhen: stepCountIs(5),
    });

    console.error(
      `✅ Client generation finished: ${JSON.stringify(result.text)}`,
    );

    return {
      model: "mock-model",
      role: "assistant",
      content: { type: "text", text: result.text },
      stopReason: "endTurn",
    };
  },
});

// 3. Connect to Server
const transport = new StdioClientTransport({
  command: "deno",
  args: ["run", "-A", "examples/simple_server.ts"],
});

console.error("🔌 Connecting to server...");
await client.connect(transport);
console.error("✅ Connected.");

// 4. Trigger the flow
console.error("❓ Calling 'ask-agent' tool on server...");
try {
  const result = await client.callTool({
    name: "ask-agent",
    arguments: { question: "What is 15 + 27? Give me details!!!" },
  });

  console.log("\n🏁 Final Result from Server:");
  // @ts-ignore: raw content access
  console.log(result.content[0].text);
} catch (error) {
  console.error("❌ Tool call failed:", error);
}
