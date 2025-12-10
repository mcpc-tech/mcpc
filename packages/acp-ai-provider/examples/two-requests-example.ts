import { createACPProvider } from "../src/provider.ts";
import { streamText } from "ai";
import process from "node:process";

// Create provider for an ACP agent
const provider = createACPProvider({
  command: "claude-code-acp",
  args: [],
  session: {
    cwd: process.cwd(),
    mcpServers: [],
  },
  persistSession: true,
});

async function main() {
  console.log("\n--- Testing Session Persistence (Two Requests) ---\n");

  try {
    // Request 1: Set context
    console.log("Request 1: My name is Bob");
    const { textStream: stream1 } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt: "My name is Bob. Please just say 'Hello Bob'.",
    });

    for await (const chunk of stream1) {
      process.stdout.write(chunk);
    }
    console.log("\n\n------------------------------\n");

    // Request 2: Check context (without passing history)
    console.log("Request 2: What is my name?");
    const { textStream: stream2 } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt: "What is my name?",
    });

    for await (const chunk of stream2) {
      process.stdout.write(chunk);
    }
    console.log("\n\n✅ Test complete");
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    provider.cleanup();
  }
}

main().catch(console.error);
