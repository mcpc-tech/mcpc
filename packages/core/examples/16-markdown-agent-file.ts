/**
 * Example: Load Agent Definitions from Markdown Files
 *
 * Run:
 * ```bash
 * GITHUB_PERSONAL_ACCESS_TOKEN=xxx deno run --allow-all packages/core/examples/16-markdown-agent-file.ts
 * ```
 */

import { mcpc } from "@mcpc/core";
import { markdownLoaderPlugin } from "@mcpc/plugin-markdown-loader";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = await mcpc(
  [{ name: "mcpc-markdown-example", version: "1.0.0" }, {
    capabilities: { tools: {} },
  }],
  [
    new URL(
      "../../plugin-markdown-loader/examples/codex-fork.md",
      import.meta.url,
    ).pathname,
  ],
  { plugins: [markdownLoaderPlugin()] },
);

await server.connect(new StdioServerTransport());
