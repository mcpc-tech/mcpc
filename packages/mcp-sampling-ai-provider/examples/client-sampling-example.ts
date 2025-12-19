/**
 * deno run -A --env-file=.env packages/mcp-sampling-ai-provider/examples/client-sampling-example
.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  convertAISDKFinishReasonToMCP,
  convertMCPToolsToAISDK,
  selectModelFromPreferences,
  setupClientSampling,
} from "../mod.ts";
import { generateText, jsonSchema, tool } from "ai";
import { cwd } from "node:process";
import { writeFileSync } from "node:fs";

const client = new Client(
  { name: "my-client", version: "1.0.0" },
  { capabilities: { sampling: { tools: {} } } },
);

setupClientSampling(client, {
  helpers: { tool, jsonSchema },
  handler: async (params) => {
    const modelId = selectModelFromPreferences(params.modelPreferences, {
      hints: {
        "gpt-5": "openai/gpt-5-mini",
        "gpt-mini": "openai/gpt-5-mini",
      },
      priorities: {
        speed: "openai/gpt-5-mini",
        intelligence: "openai/gpt-5-mini",
      },
      default: "openai/gpt-5-mini",
    });

    try {
      console.log(`🤖 Using model: ${modelId}`);

      // Convert MCP tools from server to AI SDK format
      const aiTools = convertMCPToolsToAISDK(params.tools, params.helpers);
      console.log(`🔧 Tools:`, aiTools ? Object.keys(aiTools) : "none");

      const result = await generateText({
        model: modelId,
        messages: params.messages,
        tools: aiTools,
        onStepFinish: (step) => {
          if (step.text) {
            console.log(`   💬 Text:`, step.text);
          }
          if (step.toolResults) {
            console.log(
              `   ✅ Tool Results:`,
              JSON.stringify(
                step.toolResults.map((result) => ({
                  input: result.input,
                  output: result.output,
                })),
                null,
                2,
              ),
            );
          }
        },
      });

      writeFileSync("/tmp/steps.json", JSON.stringify(result.steps, null, 2));
      console.log("✅ Generated text:", result.text);
      console.log("✅ Finish reason:", result.finishReason);
      console.log("✅ Token usage:", result.usage);
      console.log("✅ Tool results:", result.toolResults);

      return {
        model: modelId,
        role: "assistant" as const,
        content: { type: "text" as const, text: result.text },
        stopReason: convertAISDKFinishReasonToMCP(result.finishReason),
      };
    } catch (error) {
      console.error("Error during text generation:", error);

      return {
        model: modelId,
        role: "assistant" as const,
        content: {
          type: "text" as const,
          text: "An error occurred during text generation." +
            JSON.stringify(error),
        },
        stopReason: "endTurn" as const,
      };
    }
  },
});

const transport = new StdioClientTransport({
  command: "deno",
  args: [
    "run",
    "-A",
    "examples/background_code_analysis.ts",
  ],
});

await client.connect(transport);

console.log("Connected to MCP server with sampling support.");

const tools = await client.listTools();
console.log("Available tools:", tools);

// Call analyze-code-changes tool
console.log("\nCalling analyze-code-changes...");
const analysisResult = await client.callTool({
  name: "analyze-code-changes",
  arguments: {
    workDir: cwd(),
  },
});
console.log("Analysis result:", analysisResult);
