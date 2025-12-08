import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { streamText, tool } from "ai";
import { z } from "zod";
import process from "node:process";

const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
  sessionDelayMs: 1000,
  persistSession: true,
});

async function main() {
  console.log("1. Initializing session (no tools)...");
  await provider.initSession();
  const sessionId1 = provider.getSessionId();
  console.log("Session ID 1:", sessionId1);

  console.log(
    "2. Calling streamText with tools (should trigger newSession)...",
  );

  try {
    // Define a dummy tool to ensure acpTools has entries
    const dummyTool = tool({
      description: "dummy",
      inputSchema: z.object({}),
      execute: () => "dummy",
    });

    const { textStream } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt: "Just say hello",
      tools: acpTools({ dummy: dummyTool }),
    });

    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }
    console.log("\nStream finished.");

    const sessionId2 = provider.getSessionId();
    console.log("Session ID 2:", sessionId2);

    if (sessionId1 && sessionId2 && sessionId1 !== sessionId2) {
      console.log("\n✅ SUCCESS: Session ID changed (newSession was called).");
    } else if (sessionId1 === sessionId2) {
      console.log(
        "\nℹ️ INFO: Session ID remained the same (Agent implementation dependent). Check logs for 'Updating session' message.",
      );
    }
  } catch (err) {
    console.error("Error during verification:", err);
  } finally {
    provider.cleanup();
  }
}

main().catch(console.error);
