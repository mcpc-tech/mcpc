/**
 * Minimal ACP Session Management Example
 *
 * This example demonstrates how to manage ACP sessions for multi-turn conversations.
 * Unlike streamText which is stateless, ACP providers maintain session state across requests.
 *
 * Run: deno run -A packages/acp-ai-provider/examples/session-management-example.ts
 */

import { createACPProvider } from "../src/provider.ts";
import { streamText } from "ai";
import process from "node:process";

/**
 * Session entry - one provider per session
 */
interface SessionEntry {
  provider: ReturnType<typeof createACPProvider>;
  createdAt: number;
}

/**
 * Session-scoped provider manager
 * Key: sessionId, Value: SessionEntry
 */
const sessionProviders = new Map<string, SessionEntry>();

/**
 * Initialize a new session
 */
async function initSession(
  agentCommand: string,
  agentArgs: string[] = [],
): Promise<string> {
  console.log(`[session] Creating new session for agent: ${agentCommand}`);

  const provider = createACPProvider({
    command: agentCommand,
    args: agentArgs,
    session: {
      cwd: process.cwd(),
      mcpServers: [],
    },
    // Must be true to persist session state
    persistSession: true,
  });

  // Initialize the session
  const session = await provider.initSession();
  const sessionId = session.sessionId;

  // Store in session map
  sessionProviders.set(sessionId, {
    provider,
    createdAt: Date.now(),
  });

  console.log(`[session] Session initialized: ${sessionId}`);
  return sessionId;
}

/**
 * Get an existing session provider
 */
function getSessionProvider(
  sessionId: string,
): ReturnType<typeof createACPProvider> | null {
  const entry = sessionProviders.get(sessionId);
  if (!entry) {
    console.warn(`[session] Session not found: ${sessionId}`);
    return null;
  }
  console.log(`[session] Using existing session: ${sessionId}`);
  return entry.provider;
}

/**
 * Cleanup a session
 */
function cleanupSession(sessionId: string): void {
  const entry = sessionProviders.get(sessionId);
  if (entry) {
    console.log(`[session] Cleaning up session: ${sessionId}`);
    try {
      entry.provider.cleanup();
    } catch (e) {
      console.error("[session] Error cleaning up provider:", e);
    }
    sessionProviders.delete(sessionId);
  }
}

/**
 * Send a message to a session
 */
async function chat(sessionId: string, prompt: string): Promise<void> {
  const provider = getSessionProvider(sessionId);
  if (!provider) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const { textStream } = streamText({
    model: provider.languageModel(
      process.env.ACP_MODEL,
      process.env.ACP_MODE,
    ),
    prompt,
    tools: provider.tools,
  });

  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");
}

/**
 * Main demo
 */
async function main() {
  console.log("\n=== ACP Session Management Demo ===\n");

  // 1. Initialize a session
  const sessionId = await initSession("claude-code-acp", []);

  try {
    // 2. First conversation turn
    console.log("User: My name is Alice\n");
    await chat(sessionId, "My name is Alice. Please just say 'Hello Alice'.");

    console.log("\n---\n");

    // 3. Second conversation turn (session remembers context)
    console.log("User: What is my name?\n");
    await chat(sessionId, "What is my name?");

    console.log("\n✅ Session demo complete!");
    console.log("Note: The agent remembered 'Alice' from the first turn.");
  } finally {
    // 4. Cleanup session when done
    cleanupSession(sessionId);
  }
}

main().catch(console.error);
