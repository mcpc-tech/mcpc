/**
 * MCPC Example 15: AI ACP Mode
 *
 * Demonstrates using MCPC with "ai_acp" execution mode for coding agents.
 * This mode leverages the ACP (Agent Communication Protocol) for Claude Code
 * and similar coding agents.
 *
 * Features:
 * - AI SDK ACP mode integration
 * - Tool composition with ACP backend
 * - Session management for coding tasks
 *
 * Prerequisites:
 * - Install claude-code-acp CLI
 *
 * Run with:
 * deno run --allow-all examples/15-ai-acp-mode.ts
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ComposeDefinition, mcpc } from "../mod.ts";

export const toolDefinitions: ComposeDefinition[] = [
  {
    name: "coding-assistant",
    description: `A coding assistant powered by Claude Code ACP.

Available tools:
<tool name="@modelcontextprotocol/server-everything.echo"/>
<tool name="@modelcontextprotocol/server-everything.get-sum"/>

I can help with:
1. Echo messages back
2. Perform arithmetic operations`,

    deps: {
      mcpServers: {
        "@modelcontextprotocol/server-everything": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-everything"],
          transportType: "stdio" as const,
        },
      },
    },

    options: {
      mode: "ai_acp",
      acpSettings: {
        command: "claude-code-acp",
        args: [],
        session: {},
      },
      maxSteps: 50,
      tracingEnabled: false,
    },
  },
];

export const server = await mcpc(
  [
    {
      name: "ai-acp-coding-assistant",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  ],
  toolDefinitions,
);

const transport = new StdioServerTransport();
await server.connect(transport);
