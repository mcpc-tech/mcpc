/**
 * MCPC Example: Dynamic Prompting Mode
 *
 * Demonstrates the dynamic_prompting execution mode which provides
 * a two-stage interaction model:
 * 1. First, user/LLM selects which action/tool to use
 * 2. Then, agent prompts for specific parameters needed for that tool
 *
 * This helps reduce tool confusion and improves parameter gathering accuracy.
 *
 * Usage:
 *   deno run --allow-all packages/core/examples/14-dynamic-prompting-mode.ts
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../mod.ts";

const toolDefinitions = [
  {
    name: "file-manager",
    description: `I am a file management agent that uses dynamic prompting.

Instead of overwhelming you with all parameters at once, I'll:
1. First ask you to select which file operation you want to perform
2. Then guide you through providing the specific parameters for that operation

**Available Operations:**
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>
<tool name="desktop-commander.list_directory"/>
<tool name="desktop-commander.create_directory"/>
<tool name="desktop-commander.move_file"/>

This two-stage approach helps ensure you provide the right information for each operation.`,

    deps: {
      mcpServers: {
        "desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio" as const,
        },
      },
    },
    options: {
      mode: "dynamic_prompting" as const,
    },
  },
];

export const server = await mcpc(
  [
    {
      name: "dynamic-prompting-demo",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  ],
  toolDefinitions,
);

const transport = new StdioServerTransport();
await server.connect(transport);
