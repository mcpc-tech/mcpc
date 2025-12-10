import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { streamText, tool } from "ai";
import { z } from "zod";
import process from "node:process";

// Create provider for an ACP agent (using claude-code-acp as example)
const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
});

// Define schemas
const greetSchema = z.object({
  name: z.string().describe("The name of the person to greet"),
});

const calculateSchema = z.object({
  operation: z
    .enum(["add", "subtract", "multiply", "divide"])
    .describe("The math operation to perform"),
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

async function main() {
  const prompt = process.env.PROMPT ||
    "Please greet Alice using `greet` tool, DO NOT USE ANYTHING ELSE";

  console.log({ prompt });
  console.log("\n--- Streaming response ---\n");

  try {
    const { textStream, steps } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      onChunk: (chunk) => {
        if (chunk.chunk.type === "tool-call") {
          console.log(`[tool-call] ${JSON.stringify(chunk.chunk, null, 2)}`);
        }
        if (chunk.chunk.type === "tool-result") {
          console.log(`[tool-result] ${JSON.stringify(chunk.chunk, null, 2)}`);
        }
      },
      prompt,
      // acpTools() automatically includes provider dynamic tool
      tools: acpTools({
        greet: tool({
          description: "Greet a person by name, name is Alice",
          inputSchema: greetSchema,
          execute: ({ name }: z.infer<typeof greetSchema>) => {
            console.log(`Greeting ${name}`);
            return `Hello, ${name}! Welcome to the ACP tool proxy demo.`;
          },
        }),
        calculate: tool({
          description: "Perform a simple math calculation",
          inputSchema: calculateSchema,
          execute: (
            { operation, a, b }: z.infer<typeof calculateSchema>,
          ) => {
            switch (operation) {
              case "add":
                return a + b;
              case "subtract":
                return a - b;
              case "multiply":
                return a * b;
              case "divide":
                return a / b;
            }
          },
        }),
      }),
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

    console.log("Final text: (Check stdout above)");
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    // Clean up the provider (stops the tool proxy and agent)
    provider.cleanup();
  }
}

main().catch(console.error);
