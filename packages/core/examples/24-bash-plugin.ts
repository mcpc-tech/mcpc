/**
 * MCPC Example 24: Bash Plugin
 *
 * Demonstrates how to use the bash plugin to execute shell commands
 * with output truncation and timeout protection.
 *
 * Run: deno run --allow-all examples/24-bash-plugin.ts
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../mod.ts";
import { createBashPlugin } from "../plugins.ts";

export const server = await mcpc(
  [
    {
      name: "bash-demo",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "terminal-assistant",
      description:
        `I am a terminal assistant that can help you run shell commands.

Available tools:
<tool name="bash"/>

I can:
- Execute shell commands
- Run scripts
- Perform system operations

Use bash tool to run commands.`,
      plugins: [
        createBashPlugin({
          maxBytes: 50000,
          maxLines: 500,
          timeoutMs: 30000,
        }),
      ],
    },
  ],
);

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Bash Plugin Features:
 *
 * 1. Command Execution:
 *    bash({ command: "ls -la" })
 *    bash({ command: "npm run build", cwd: "/project/path" })
 *
 * 2. Output Handling:
 *    - Truncates output if too large (default: 100KB, 2000 lines)
 *    - Shows truncation notice with stats
 *    - Separates stderr from stdout
 *
 * 3. Error Handling:
 *    - Returns exit code in output
 *    - Marks non-zero exit as error
 *    - Timeout protection (default: 60s)
 *
 * Configuration Options:
 * - maxBytes: Maximum output bytes (default: 100000)
 * - maxLines: Maximum output lines (default: 2000)
 * - timeoutMs: Timeout in ms (default: 60000)
 *
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "bash-demo": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "examples/24-bash-plugin.ts"]
 *     }
 *   }
 * }
 * ```
 */
