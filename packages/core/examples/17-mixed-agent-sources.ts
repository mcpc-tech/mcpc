/**
 * Example: Mixed Agent Sources (Inline + Markdown Files)
 *
 * Run:
 * ```bash
 * deno run --allow-all packages/core/examples/17-mixed-agent-sources.ts
 * ```
 */

import { type AgentDef, mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";

const inlineAgent: AgentDef = {
  name: "simple-file-reader",
  description: `A simple file reading agent.
Use <tool name="desktop-commander.read_file"/> to read files.
Use <tool name="desktop-commander.list_directory"/> to list directories.`,
  mcpServers: {
    "desktop-commander": {
      command: "npx",
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
    },
  },
};

const server = await mcpc({
  name: "mcpc-mixed-example",
  version: "1.0.0",
  capabilities: { tools: {} },

  plugins: ["@mcpc/plugin-markdown-loader"],

  agents: [
    inlineAgent,
    fileURLToPath(
      new URL(
        "../../plugin-markdown-loader/examples/codex-fork.md",
        import.meta.url,
      ),
    ),
  ],
});

await server.connect(new StdioServerTransport());
