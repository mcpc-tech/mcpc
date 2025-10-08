/**
 * deno run -A --env-file=.env packages/mcp-sampling-ai-provider/examples/client-sampling-example
.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  convertAISDKFinishReasonToMCP,
  selectModelFromPreferences,
  setupClientSampling,
} from "../mod.ts";
import { generateText } from "ai";
import { cwd } from "node:process";

const client = new Client(
  { name: "my-client", version: "1.0.0" },
  { capabilities: { sampling: {} } },
);

setupClientSampling(client, {
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
      const result = await generateText({
        model: modelId,
        messages: params.messages,
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

      console.log("✅ Generated text:", result.text);
      console.log("✅ Finish reason:", result.finishReason);
      console.log("✅ Token usage:", result.usage);

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
    "packages/mcp-sampling-ai-provider/examples/background_code_analysis.ts",
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

// const result = await generateText({
//   model: 'openai/gpt-5-mini',
//   prompt: "Write a short poem about coding.",
// })

// console.log("✅ Generated text:", result.text);
// console.log("✅ Finish reason:", result.finishReason);
// console.log("✅ Token usage:", result.usage);
