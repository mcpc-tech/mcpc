import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { streamText, tool } from "ai";
import { z } from "zod";
import process from "node:process";

const provider = createACPProvider({
  command: "claude-agent-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [{
      name: "filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      env: [],
    }],
  },
});

async function main() {
  try {
    const { textStream, steps } = streamText({
      model: provider.languageModel(),
      prompt:
        "Greet Alice, then list files in current directory using `list_directory` tool.",
      tools: acpTools({
        greet: tool({
          description: "Greet someone",
          inputSchema: z.object({ name: z.string() }),
          execute: ({ name }) => `Hello, ${name}!`,
        }),
      }),
    });

    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }

    console.log("\n\nTool calls:", (await steps).flatMap((s) => s.toolCalls));
  } finally {
    provider.cleanup();
  }
}

main().catch(console.error);
