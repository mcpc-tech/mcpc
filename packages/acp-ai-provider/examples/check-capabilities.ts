/**
 * Check agent capabilities for multiple ACP agents
 *
 * Run: deno run -A packages/acp-ai-provider/examples/check-capabilities.ts
 */

import {
  ClientSideConnection,
  type InitializeResponse,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import { type ChildProcess, spawn } from "node:child_process";
import process from "node:process";
import { Readable, Writable } from "node:stream";

interface AgentConfig {
  name: string;
  command: string;
  args: string[];
}

const AGENTS: AgentConfig[] = [
  { name: "Claude Code ACP", command: "claude-code-acp", args: [] },
  { name: "Codex ACP", command: "codex-acp", args: [] },
  { name: "Gemini ACP", command: "gemini", args: ["--experimental-acp"] },
];

// Extended type to include agentInfo which is present in actual responses
interface ExtendedInitializeResponse extends InitializeResponse {
  agentInfo?: {
    name?: string;
    title?: string;
    version?: string;
  };
}

async function checkAgent(config: AgentConfig): Promise<{
  name: string;
  success: boolean;
  error?: string;
  capabilities?: ExtendedInitializeResponse;
}> {
  let agentProcess: ChildProcess | null = null;

  try {
    agentProcess = spawn(config.command, config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    if (!agentProcess.stdin || !agentProcess.stdout) {
      throw new Error("Failed to spawn process with stdio");
    }

    const input = Writable.toWeb(agentProcess.stdin) as WritableStream<
      Uint8Array
    >;
    const output = Readable.toWeb(agentProcess.stdout) as ReadableStream<
      Uint8Array
    >;

    const connection = new ClientSideConnection(
      () => ({
        sessionUpdate: () => Promise.resolve(),
        requestPermission: () =>
          Promise.resolve({
            outcome: { outcome: "selected", optionId: "allow" },
          }),
        writeTextFile: () => {
          throw new Error("Not implemented");
        },
        readTextFile: () => {
          throw new Error("Not implemented");
        },
      }),
      ndJsonStream(input, output),
    );

    // Add timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout after 10s")), 10000)
    );

    const initResult = await Promise.race([
      connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
      }),
      timeoutPromise,
    ]);

    return {
      name: config.name,
      success: true,
      capabilities: initResult,
    };
  } catch (err) {
    return {
      name: config.name,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (agentProcess) {
      agentProcess.kill();
    }
  }
}

function formatBoolean(value: boolean | undefined): string {
  if (value === true) return "✅";
  if (value === false) return "❌";
  return "—";
}

async function main() {
  console.log("=== ACP Agent Capabilities Check ===\n");
  console.log("Checking agents...\n");

  const results = await Promise.all(AGENTS.map(checkAgent));

  // Build table data
  const tableData: Record<string, Record<string, string>> = {};

  for (const result of results) {
    if (!result.success) {
      tableData[result.name] = {
        Status: `❌ ${result.error}`,
        Version: "—",
        loadSession: "—",
        Image: "—",
        Audio: "—",
        EmbeddedContext: "—",
        "MCP HTTP": "—",
        "MCP SSE": "—",
      };
      continue;
    }

    const caps = result.capabilities!;
    const agentCaps = caps.agentCapabilities;
    const promptCaps = agentCaps?.promptCapabilities;
    const mcpCaps = agentCaps?.mcpCapabilities;

    tableData[result.name] = {
      Status: "✅ OK",
      Version: caps.agentInfo?.version ?? "—",
      loadSession: formatBoolean(agentCaps?.loadSession),
      Image: formatBoolean(promptCaps?.image),
      Audio: formatBoolean(promptCaps?.audio),
      EmbeddedContext: formatBoolean(promptCaps?.embeddedContext),
      "MCP HTTP": formatBoolean(mcpCaps?.http),
      "MCP SSE": formatBoolean(mcpCaps?.sse),
    };
  }

  console.log("=== Agent Capabilities ===\n");
  console.table(tableData);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
