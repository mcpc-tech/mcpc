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
});

async function main() {
  console.log("\n--- Testing Multi-Message Conversation ---\n");

  try {
    // Test with multiple messages to verify all messages are sent
    const { textStream } = streamText({
      onChunk: ({ chunk }) => {
        console.log(JSON.stringify(chunk));
      },
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      messages: [
        {
          role: "user",
          content: "My name is Alice and I like the number 5.",
        },
        {
          role: "assistant",
          content:
            "Nice to meet you, Alice! I'll remember that you like the number 5.",
        },
        {
          role: "user",
          content: "Please greet me by name.",
        },
      ],
    });

    console.log("\n--- Streaming Text Output ---\n");
    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }

    console.log("\n\n--- Results ---");
    console.log(
      "\n✅ Test complete - Check if the assistant remembered Alice's name from the first message",
    );
  } catch (error) {
    console.error("\n❌ Error:", error);
  } finally {
    // Clean up the provider (stops the tool proxy and agent)
    provider.cleanup();
  }
}

main().catch(console.error);
