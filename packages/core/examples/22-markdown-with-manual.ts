/**
 * Example 22: Markdown Agent with Progressive Manual Disclosure
 *
 * Demonstrates loading a markdown agent file that uses the description/manual pattern:
 * - `description` in frontmatter → short description for tool listing
 * - Markdown body → `manual` field for detailed instructions
 *
 * Run:
 * ```bash
 * deno run --allow-all packages/core/examples/22-markdown-with-manual.ts
 * ```
 */

import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";

// Load a single markdown agent with progressive disclosure
const server = await mcpc(
  [
    { name: "markdown-manual-example", version: "1.0.0" },
    { capabilities: { tools: {} } },
  ],
  [
    fileURLToPath(
      new URL(
        "../../plugin-markdown-loader/examples/agents/file-manager.md",
        import.meta.url,
      ),
    ),
  ],
  { plugins: ["@mcpc/plugin-markdown-loader"] },
);

await server.connect(new StdioServerTransport());
