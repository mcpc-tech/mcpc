import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { streamText, tool } from "ai";
import { z } from "zod";
import process from "node:process";

// Create provider for an ACP agent
const provider = createACPProvider({
  command: "claude-agent-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
});

// Schema for client tool
const getUserInputSchema = z.object({
  prompt: z.string().describe("The prompt to show to the user"),
});

async function main() {
  const prompt = "Please get user input using the getUserInput tool";

  console.log({ prompt });
  console.log("\n--- Testing Client Tool (no execute) ---\n");

  try {
    const { steps } = streamText({
      onChunk: ({ chunk }) => {
        console.log(JSON.stringify(chunk), "\n");
      },
      model: provider.languageModel(),
      prompt,
      tools: acpTools({
        // This is a client-side tool WITHOUT execute function
        // It should NOT throw an error, instead it should return isClientTool: true
        getUserInput: tool({
          description: "Get input from the user (client-side tool)",
          inputSchema: getUserInputSchema,
          // No execute function - this is a client tool!
        }),
        // Server-side tool for comparison
        echo: tool({
          description: "Echo back a message (server-side tool)",
          inputSchema: z.object({
            message: z.string(),
          }),
          execute: ({ message }) => {
            return `Server echoes: ${message}`;
          },
        }),
      }),
    });

    console.log("\n\n--- Results ---");
    const resultSteps = await steps;
    console.log(
      "Tool calls made:",
      resultSteps
        .flatMap((s) => s.toolCalls)
        .filter(Boolean),
    );

    console.log("\n✅ Client tool test passed!");
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    provider.cleanup();
  }
}

main().catch(console.error);
