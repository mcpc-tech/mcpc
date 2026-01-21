/**
 * Example: MCPC - Advanced Usage
 *
 * Demonstrates advanced features:
 * - Multiple agents
 * - Mixed sources (inline + markdown files)
 * - Plugin configuration
 * - Setup callback
 * - AI SDK modes
 *
 * Run:
 * ```bash
 * deno run --allow-all packages/core/examples/19-mcpc-advanced.ts
 * ```
 */

import { type AgentDef, mcpc } from "@mcpc/core";
import { jsonSchema } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Define agents separately for better organization
const fileReaderAgent: AgentDef = {
  name: "file-reader",
  description: `A simple file reading agent.
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.list_directory"/>`,
  mcpServers: {
    "desktop-commander": {
      command: "npx",
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
    },
  },
  mode: "agentic",
};

const dataAnalystAgent: AgentDef = {
  name: "data-analyst",
  description: `An AI-powered data analyst using sampling mode.
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.execute_command"/>`,
  mcpServers: {
    "desktop-commander": {
      command: "npx",
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
    },
  },
  mode: "ai_sampling",
  // Advanced options grouped together
  options: {
    maxSteps: 30,
    maxTokens: 64000,
    tracingEnabled: true,
  },
};

// Create server
const server = await mcpc({
  name: "multi-agent-server",
  version: "1.0.0",
  capabilities: {
    tools: { listChanged: true },
  },

  // Multiple agents
  agents: [
    fileReaderAgent,
    dataAnalystAgent,
    // Can also include markdown file paths (requires markdown-loader plugin)
    // fileURLToPath(new URL("../../plugin-markdown-loader/examples/codex-fork.md", import.meta.url)),
  ],

  // Global plugins
  plugins: [
    // String-based plugin loading
    // "@mcpc/plugin-markdown-loader",

    // Or inline plugin objects
    {
      name: "request-logger",
      beforeToolExecute: (context) => {
        console.log(`[LOG] Executing tool: ${context.toolName}`);
        return undefined;
      },
      afterToolExecute: (context) => {
        console.log(
          `[LOG] Tool ${context.toolName} completed in ${context.executionTimeMs}ms`,
        );
        return undefined;
      },
    },
  ],

  // Setup callback for custom tools
  setup: (server) => {
    // Register custom internal tools
    server.tool(
      "get-current-time",
      "Get the current timestamp",
      jsonSchema<{ timezone?: string }>({
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "Timezone (e.g., 'America/New_York')",
          },
        },
      }),
      (_args) => {
        const date = new Date();
        return {
          content: [
            {
              type: "text",
              text: `Current time: ${date.toISOString()}`,
            },
          ],
        };
      },
    );
  },
});

// Connect to transport
const transport = new StdioServerTransport();
await server.connect(transport);
