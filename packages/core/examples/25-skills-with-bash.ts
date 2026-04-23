/**
 * MCPC Example 25: Skills + Bash Plugin
 *
 * Demonstrates how to combine skills plugin with bash plugin.
 * Skills load domain knowledge, bash executes scripts.
 *
 * Run: deno run --allow-all examples/25-skills-with-bash.ts
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mcpc } from "../mod.ts";
import { createBashPlugin, createSkillsPlugin } from "../plugins.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../../..");

export const server = await mcpc(
  [
    {
      name: "skills-bash-demo",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "dev-assistant",
      options: {
        mode: "agentic",
      },
      description: `I am a development assistant with specialized skills.

Available tools:
<tool name="dev-assistant__load-skill"/>
<tool name="bash"/>

I can:
- Load domain-specific knowledge via skills
- Execute scripts using bash tool
- Help with development tasks`,

      plugins: [
        createSkillsPlugin({
          paths: [join(projectRoot, ".agents/skills")],
        }),
        createBashPlugin(),
      ],
    },
  ],
);

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Skills + Bash Workflow:
 *
 * 1. Agent loads skill instructions:
 *    dev-assistant__load-skill({ skill: "creating-slidev-presentations" })
 *    Returns: SKILL.md content with presentation guide
 *
 * 2. Agent loads script to execute:
 *    dev-assistant__load-skill({ skill: "creating-slidev-presentations", ref: "scripts/dev.sh" })
 *    Returns: Path to the script (then use bash to execute)
 *
 * 3. Agent executes the script:
 *    bash({ command: "bash /path/to/scripts/deploy.sh" })
 *    Returns: Script output
 *
 * Available skills (from .agents/skills/):
 * - creating-slidev-presentations: Slidev presentation guide (has scripts/dev.sh)
 *
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "skills-bash-demo": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "examples/25-skills-with-bash.ts"]
 *     }
 *   }
 * }
 * ```
 */
