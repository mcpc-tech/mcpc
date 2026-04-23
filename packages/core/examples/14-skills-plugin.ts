/**
 * MCPC Example 14: Skills Plugin
 *
 * Demonstrates how to use the skills plugin to add domain-specific
 * knowledge with lazy loading, following Agent Skills specification.
 *
 * @see https://agentskills.io/specification
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mcpc } from "../mod.ts";
import { createSkillsPlugin } from "../plugins.ts";

// Get directory of current file for reliable relative paths
const __dirname = dirname(fileURLToPath(import.meta.url));
// Skills are in .agents/skills at project root
const projectRoot = join(__dirname, "../../..");

export const server = await mcpc(
  [
    {
      name: "skills-demo",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "slide-agent",

      options: {
        mode: "agentic",
      },

      // Just describe the agent - skills info is in load-skill tool
      description:
        "I am a presentation assistant that can help with creating professional slides using Slidev.",

      plugins: [
        createSkillsPlugin({
          paths: [join(projectRoot, ".agents/skills")],
        }),
      ],
    },
  ],
);

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Skills Directory Structure:
 *
 * .agents/skills/
 * └── creating-slidev-presentations/
 *     └── SKILL.md
 *
 * The coding-assistant__load-skill tool description will show:
 *
 * Load a skill's detailed instructions or reference files for the "coding-assistant" agent.
 *
 * Available skills:
 * - creating-slidev-presentations: Creates presentation slides using Slidev with Markdown syntax
 *
 * Usage:
 * - coding-assistant__load-skill({ skill: "skill-name" }) - Load main SKILL.md content
 * - coding-assistant__load-skill({ skill: "skill-name", ref: "references/file.md" }) - Load reference file
 *
 * Usage Examples:
 *
 * 1. Load skill instructions:
 *    Agent calls: coding-assistant__load-skill({ skill: "creating-slidev-presentations" })
 *    Returns: SKILL.md body content
 *
 * 2. Load reference file:
 *    Agent calls: coding-assistant__load-skill({ skill: "skill-name", ref: "references/file.md" })
 *    Returns: file.md content
 *
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "skills-demo": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "14-skills-plugin.ts"]
 *     }
 *   }
 * }
 * ```
 */
