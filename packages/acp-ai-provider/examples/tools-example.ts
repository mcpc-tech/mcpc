import { createACPProvider } from "../src/provider.ts";
import { streamText } from "ai";
import process from "node:process";

// Create provider for an ACP agent (using claude-code-acp as example)
const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
  // Define tools that will be executed on the host side
  tools: {
    greet: {
      description: "Greet a person by name",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the person to greet",
          },
        },
        required: ["name"],
      },
      // deno-lint-ignore require-await
      execute: async (args) => {
        const { name } = args as { name: string };
        // console.log(`[Host] Executing greet tool with args:`, args);
        return `Hello, ${name}! Welcome to the ACP tool proxy demo.`;
      },
    },
    calculate: {
      description: "Perform a simple math calculation",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["add", "subtract", "multiply", "divide"],
            description: "The math operation to perform",
          },
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        required: ["operation", "a", "b"],
      },
      // deno-lint-ignore require-await
      execute: async (args) => {
        const { operation, a, b } = args as {
          operation: string;
          a: number;
          b: number;
        };
        // console.log(`[Host] Executing calculate tool: ${a} ${operation} ${b}`);
        switch (operation) {
          case "add":
            return a + b;
          case "subtract":
            return a - b;
          case "multiply":
            return a * b;
          case "divide":
            return a / b;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      },
    },
  },
});

async function main() {
  const prompt = process.env.PROMPT ||
    "Please greet Alice using `greet` tool, DO NOT USE ANYTHING ELSE";

  console.log({ prompt });
  console.log("\n--- Streaming response ---\n");

  try {
    const { textStream, steps } = streamText({
      model: provider.languageModel(),
      prompt,
      // Tools are automatically exposed via the provider
    });

    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }

    console.log("\n\n--- Results ---");
    const resultSteps = await steps;
    console.log(
      "Tool calls made:",
      resultSteps
        .flatMap((s) => s.toolCalls.map((tc) => tc.toolName))
        .filter(Boolean),
    );

    // Get the full text
    // textStream has already been consumed by the for-await loop above
    // so we can't consume it again. But we can just use the accumulated usage or just print what we have.
    // In this example, we already printed chunks to stdout.
    console.log("Final text: (Check stdout above)");
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    // Clean up the provider (stops the tool proxy and agent)
    provider.cleanup();
  }
}

main().catch(console.error);
