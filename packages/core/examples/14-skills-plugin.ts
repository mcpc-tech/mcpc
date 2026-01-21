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

export const server = await mcpc({
  name: "skills-demo",
  version: "1.0.0",
  capabilities: { tools: { listChanged: true } },

  agents: [
    {
      name: "coding-assistant",
      mode: "agentic",

      // Just describe the agent - skills info is in load-skill tool
      description:
        "I am a coding assistant that can help with git workflows and code reviews.",

      plugins: [
        createSkillsPlugin({
          paths: [join(__dirname, "skills")],
        }),
      ],
    },
  ],
});

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Skills Directory Structure:
 *
 * ./examples/skills/
 * ├── git-workflow/
 * │   ├── SKILL.md
 * │   └── references/
 * │       ├── branching.md
 * │       └── hotfix.md
 * └── code-review/
 *     └── SKILL.md
 *
 * The coding-assistant__load-skill tool description will show:
 *
 * Load a skill's detailed instructions or reference files for the "coding-assistant" agent.
 *
 * Available skills:
 * - git-workflow: Git branching and commit best practices
 * - code-review: Code review guidelines and checklist
 *
 * Usage:
 * - coding-assistant__load-skill({ skill: "skill-name" }) - Load main SKILL.md content
 * - coding-assistant__load-skill({ skill: "skill-name", ref: "references/file.md" }) - Load reference file
 *
 * Usage Examples:
 *
 * 1. Load skill instructions:
 *    Agent calls: coding-assistant__load-skill({ skill: "git-workflow" })
 *    Returns: SKILL.md body content
 *
 * 2. Load reference file:
 *    Agent calls: coding-assistant__load-skill({ skill: "git-workflow", ref: "references/hotfix.md" })
 *    Returns: hotfix.md content
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
