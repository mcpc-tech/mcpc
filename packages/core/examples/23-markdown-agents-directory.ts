/**
 * Example 23: Load Multiple Agents from a Directory
 *
 * Demonstrates loading all markdown agent files from a directory:
 * - Uses `loadMarkdownAgentDirectory()` to scan a folder
 * - All .md files with valid frontmatter are loaded as agents
 * - Supports recursive option for subdirectories
 *
 * Run:
 * ```bash
 * deno run --allow-all packages/core/examples/23-markdown-agents-directory.ts
 * ```
 */

import { mcpc } from "@mcpc/core";
import {
  loadMarkdownAgentDirectory,
  markdownLoaderPlugin,
} from "@mcpc/plugin-markdown-loader";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(
  __dirname,
  "../../plugin-markdown-loader/examples/agents",
);

// Load all agents from the directory
const { definitions: agentDefinitions, errors } =
  await loadMarkdownAgentDirectory(agentsDir);

// Report any errors
if (errors.length > 0) {
  console.warn(`Encountered ${errors.length} error(s):`);
  for (const err of errors) {
    console.warn(`  - ${err.path}: ${err.error}`);
  }
}

console.log(`Loaded ${agentDefinitions.length} agents from ${agentsDir}`);
for (const agent of agentDefinitions) {
  console.log(`  - ${agent.name}: ${agent.description}`);
  if (agent.manual) {
    console.log(`    (has manual: ${agent.manual.length} chars)`);
  }
}

const server = await mcpc(
  [
    { name: "markdown-directory-example", version: "1.0.0" },
    { capabilities: { tools: {} } },
  ],
  agentDefinitions,
  { plugins: [markdownLoaderPlugin()] },
);

await server.connect(new StdioServerTransport());
