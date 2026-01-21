/**
 * MCPC Example 20: Skills Plugin with AI Sampling Mode
 *
 * Demonstrates combining skills plugin with ai_sampling mode.
 * This enables:
 * - Lazy-loaded domain knowledge via skills
 * - AI-powered tool orchestration via sampling
 *
 * @see https://agentskills.io/specification
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mcpc } from "../mod.ts";
import { createSkillsPlugin } from "../plugins.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Skills are in .claude/skills at project root
const projectRoot = join(__dirname, "../../..");

export const server = await mcpc(
  [
    {
      name: "skills-ai-sampling-demo",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: { listChanged: true },
      },
    },
  ],
  [
    {
      name: "smart-dev-assistant",

      options: {
        mode: "ai_sampling", // Use AI sampling for orchestration
      },

      description: `I am a smart development assistant with specialized skills.

I can load domain-specific knowledge on demand using skills, and orchestrate
file operations through AI sampling.

Available tools:
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>

When I need specialized knowledge (git workflows, code review guidelines),
I'll load the appropriate skill first.`,

      plugins: [
        createSkillsPlugin({
          paths: [join(projectRoot, ".claude/skills")],
        }),
      ],

      deps: {
        mcpServers: {
          "@wonderwhy-er/desktop-commander": {
            command: "npx",
            args: ["-y", "@wonderwhy-er/desktop-commander"],
            transportType: "stdio",
          },
        },
      },
    },
  ],
);

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * This example combines:
 *
 * 1. Skills Plugin (from example 14)
 *    - Provides load-skill tool for lazy-loading domain knowledge
 *    - Skills are loaded from .claude/skills/ directory
 *
 * 2. AI Sampling Mode (from example 01)
 *    - Uses client's sampling capability for tool orchestration
 *    - Agent can call multiple tools autonomously
 *
 * The skills plugin works across all modes because it:
 * - Has no `apply` filter (mode-agnostic)
 * - Uses `composeStart` hook (runs before mode-specific processing)
 * - Adds tools to server directly via `configureServer` hook
 *
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "skills-ai-sampling-demo": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "20-skills-with-ai-sampling.ts"]
 *     }
 *   }
 * }
 * ```
 */
