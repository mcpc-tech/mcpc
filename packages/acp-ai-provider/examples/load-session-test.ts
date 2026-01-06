/**
 * Test script to understand loadSession behavior
 *
 * This script tests how loadSession replays message history via sessionUpdate notifications.
 *
 * The ACP protocol specifies that when loadSession is called, the agent should:
 * 1. Restore the session context and conversation history
 * 2. Connect to the specified MCP servers
 * 3. Stream the entire conversation history back to the client via notifications
 *
 * Run: deno run -A packages/acp-ai-provider/examples/load-session-test.ts
 */

import { createACPProvider } from "../src/provider.ts";
import { streamText } from "ai";
import process from "node:process";

async function main() {
  console.log("=== Load Session History Replay Test ===\n");
  console.log(
    "This test demonstrates how loadSession captures replayed history.\n",
  );

  // Step 1: Create a new session and have a conversation
  console.log("=== Step 1: Creating new session ===\n");

  const provider1 = createACPProvider({
    command: "claude-code-acp",
    args: [],
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
    persistSession: true,
  });

  const session1 = await provider1.initSession();
  console.log(`Session created: ${session1.sessionId}\n`);

  // Step 2: Send a message
  console.log("=== Step 2: Sending first message ===\n");
  console.log('User: "My name is TestUser. Just say Hello TestUser."\n');

  const { textStream: stream1 } = streamText({
    model: provider1.languageModel(),
    prompt: "My name is TestUser. Just say 'Hello TestUser' and nothing else.",
    tools: provider1.tools,
  });

  console.log("Assistant: ");
  for await (const chunk of stream1) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // Get the session ID for later
  const sessionId = provider1.getSessionId();
  console.log(`Session ID to resume: ${sessionId}\n`);

  // Cleanup first provider
  provider1.cleanup();
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Step 3: Create a new provider with existingSessionId to load the session
  console.log("=== Step 3: Loading session with new provider ===\n");
  console.log("Creating new provider with existingSessionId...\n");

  const provider2 = createACPProvider({
    command: "claude-code-acp",
    args: [],
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
    existingSessionId: sessionId!,
    persistSession: true,
  });

  // Initialize the session - this triggers loadSession
  await provider2.initSession();

  // Check what history was replayed
  const replayedHistory = provider2.getReplayedHistory();
  console.log(
    `Collected ${replayedHistory.length} sessionUpdate notifications during loadSession.\n`,
  );

  if (replayedHistory.length > 0) {
    console.log("History replay detected! Notification types received:");
    const typeCounts: Record<string, number> = {};
    for (const notification of replayedHistory) {
      const type = notification.update.sessionUpdate;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(typeCounts)) {
      console.log(`  - ${type}: ${count}`);
    }

    // Convert to AI SDK messages
    const messages = provider2.getReplayedHistoryAsMessages();
    console.log(`\nConverted to ${messages.length} AI SDK messages:`);
    for (const msg of messages) {
      console.log(`  - role: ${msg.role}`);
      if (typeof msg.content === "string") {
        console.log(`    content: "${msg.content.slice(0, 100)}..."`);
      } else if (Array.isArray(msg.content)) {
        console.log(`    content: [${msg.content.length} parts]`);
      }
    }
  } else {
    console.log(
      "No history was replayed via sessionUpdate notifications during loadSession.",
    );
    console.log(
      "This means the agent handles history internally without notifying the client.",
    );
    console.log(
      "The isFreshSession=false approach is correct - only send new user messages.",
    );
  }

  // Step 4: Send another message to verify context is preserved
  console.log("\n=== Step 4: Testing context preservation ===\n");
  console.log('User: "What is my name?"\n');

  const { textStream: stream2 } = streamText({
    model: provider2.languageModel(),
    prompt: "What is my name? Just say the name.",
    tools: provider2.tools,
  });

  console.log("Assistant: ");
  for await (const chunk of stream2) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  // Cleanup
  provider2.cleanup();

  console.log("=== Test Complete ===\n");
  console.log("Summary:");
  console.log("- If history was replayed during loadSession, the client can");
  console.log(
    "  use getReplayedHistory() or getReplayedHistoryAsMessages() to access it.",
  );
  console.log(
    "- If no history was replayed, the agent handles history internally",
  );
  console.log("  and the current isFreshSession=false approach is correct.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
