/**
 * Example: Loading agents from a directory
 *
 * This example demonstrates:
 * 1. Loading all markdown agents from a directory
 * 2. Using the description/manual progressive disclosure feature
 *
 * Run with:
 *   deno run -A packages/plugin-markdown-loader/examples/load-agents-directory.ts
 */

import { loadMarkdownAgentDirectory } from "../mod.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(__dirname, "agents");

async function main() {
  console.log("Loading agents from directory:", agentsDir);
  console.log("---");

  // Load all agents from the directory
  const agents = await loadMarkdownAgentDirectory(agentsDir);

  console.log(`Found ${agents.length} agents:\n`);

  for (const agent of agents) {
    console.log(`📦 Agent: ${agent.name}`);
    console.log(`   Description: ${agent.description}`);

    if (agent.manual) {
      // Show first 100 chars of manual
      const preview = agent.manual.slice(0, 100).replace(/\n/g, " ");
      console.log(`   Manual: ${preview}...`);
      console.log(`   (Full manual available via 'man { manual: true }')`);
    }

    if (agent.deps?.mcpServers) {
      const servers = Object.keys(agent.deps.mcpServers);
      console.log(`   MCP Servers: ${servers.join(", ")}`);
    }

    console.log("");
  }
}

main().catch(console.error);
