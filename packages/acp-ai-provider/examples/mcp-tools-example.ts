import { createACPProvider } from "../src/provider.ts";
import { streamText } from "ai";
import process from "node:process";

// Create provider for an ACP agent (using claude-code-acp as example)
const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    // Tools come from MCP servers (not from AI SDK `tools` definitions)
    mcpServers: [
      {
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        env: [],
      },
    ],
  },
});

async function main() {
  const prompt = process.env.PROMPT ||
    "Use `list_directory` to list files in cwd. DO NOT USE ANYTHING ELSE.";

  console.log({ prompt });
  console.log("\n--- Streaming response ---\n");

  try {
    const { steps } = streamText({
      onChunk: ({ chunk }) => {
        console.log(JSON.stringify(chunk), "\n");
      },
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt,
      tools: provider.tools,
    });

    console.log("\n\n--- Results ---");
    const resultSteps = await steps;
    console.log(
      "Tool calls made:",
      resultSteps
        .flatMap((s) => s.toolCalls)
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
