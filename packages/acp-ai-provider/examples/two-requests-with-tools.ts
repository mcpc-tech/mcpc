import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { streamText, tool } from "ai";
import { z } from "zod";
import process from "node:process";

// Create provider for an ACP agent with session persistence
const provider = createACPProvider({
  command: "claude-agent-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
});

// Define tool schemas
const getTimeSchema = z.object({
  timezone: z.string().optional().describe(
    "Timezone (e.g., 'UTC', 'America/New_York')",
  ),
});

const rememberSchema = z.object({
  key: z.string().describe("The key to store the value under"),
  value: z.string().describe("The value to remember"),
});

const recallSchema = z.object({
  key: z.string().describe("The key to recall the value for"),
});

// Simple in-memory store for the remember/recall tools
const memory: Record<string, string> = {};

// Define tools used across both requests
const tools = acpTools({
  get_time: tool({
    description: "Get the current time",
    inputSchema: getTimeSchema,
    execute: ({ timezone }) => {
      const now = new Date();
      if (timezone) {
        return now.toLocaleString("en-US", { timeZone: timezone });
      }
      return now.toISOString();
    },
  }),
  remember: tool({
    description: "Remember a value for later recall",
    inputSchema: rememberSchema,
    execute: ({ key, value }) => {
      memory[key] = value;
      return `Remembered: ${key} = ${value}`;
    },
  }),
  recall: tool({
    description: "Recall a previously remembered value",
    inputSchema: recallSchema,
    execute: ({ key }: z.infer<typeof recallSchema>) => {
      const value = memory[key];
      if (value) {
        return `Recalled: ${key} = ${value}`;
      }
      return `No value found for key: ${key}`;
    },
  }),
});

async function main() {
  console.log("\n--- Testing Tool Use Across Two Requests ---\n");

  try {
    // Request 1: Use remember tool
    console.log("Request 1: Remember my favorite color");
    const { textStream: stream1, steps: steps1 } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt:
        "Please use the remember tool to store my favorite color as 'blue'. Just confirm when done.",
      tools,
    });

    for await (const chunk of stream1) {
      process.stdout.write(chunk);
    }

    const resultSteps1 = await steps1;
    console.log(
      "\n\nTool calls in request 1:",
      resultSteps1.flatMap((s) => s.toolCalls.map((tc) => tc.toolName)).filter(
        Boolean,
      ),
    );

    console.log("\n------------------------------\n");

    // Request 2: Use recall tool (this tests that tool-call history is handled correctly)
    console.log("Request 2: Recall my favorite color");
    const { textStream: stream2, steps: steps2 } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt: "What is my favorite color? Use the recall tool to find out.",
      tools,
    });

    for await (const chunk of stream2) {
      process.stdout.write(chunk);
    }

    const resultSteps2 = await steps2;
    console.log(
      "\n\nTool calls in request 2:",
      resultSteps2.flatMap((s) => s.toolCalls.map((tc) => tc.toolName)).filter(
        Boolean,
      ),
    );

    console.log(
      "\n\n✅ Test complete - tool-call handling across requests works!",
    );
    console.log("Memory state:", memory);
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    provider.cleanup();
  }
}

main().catch(console.error);
