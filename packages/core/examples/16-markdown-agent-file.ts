/**
 * Example: Load Agent Definitions from Markdown Files
 *
 * Run:
 * ```bash
 * GITHUB_PERSONAL_ACCESS_TOKEN=xxx deno run --allow-all packages/core/examples/16-markdown-agent-file.ts
 * ```
 */

import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";

const server = await mcpc(
  [{ name: "mcpc-markdown-example", version: "1.0.0" }, {
    capabilities: { tools: {} },
  }],
  [fileURLToPath(
    new URL(
      "../../plugin-markdown-loader/examples/codex-fork.md",
      import.meta.url,
    ),
  )],
  { plugins: ["@mcpc/plugin-markdown-loader"] }, // String-based plugin loading
);

await server.connect(new StdioServerTransport());
