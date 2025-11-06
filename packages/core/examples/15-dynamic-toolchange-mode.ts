/**
 * MCPC Example: Dynamic Tool Change Mode
 *
 * Demonstrates the dynamic_toolchange execution mode which allows:
 * - Runtime enabling/disabling of tools
 * - Client notification when tool list changes
 * - Reduced initial tool overload
 *
 * This is inspired by GitHub MCP Server's dynamic toolsets feature where
 * you start with a small set of tools and dynamically enable more as needed.
 *
 * Usage:
 *   deno run --allow-all packages/core/examples/15-dynamic-toolchange-mode.ts
 *
 * Example interactions:
 *   1. "List the currently enabled tools"
 *   2. "Enable the write_file and create_directory tools"
 *   3. "Now write a file to /tmp/test.txt with content 'Hello World'"
 *   4. "Disable the write_file tool"
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../mod.ts";

const toolDefinitions = [
  {
    name: "adaptive-file-manager",
    description:
      `I am an adaptive file management agent that uses dynamic tool changes.

I can help you manage which file operations are currently available:
- Start with commonly used operations enabled
- Enable additional operations only when needed
- Disable operations you don't want to use

**Tool Management:**
- Use 'enable_tools' to activate specific tools
- Use 'disable_tools' to deactivate specific tools
- Tool changes trigger client notifications for better UX

**Available Tools:**
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>
<tool name="desktop-commander.list_directory"/>
<tool name="desktop-commander.create_directory"/>
<tool name="desktop-commander.move_file"/>
<tool name="desktop-commander.delete_file"/>

This approach helps:
1. Reduce initial tool confusion
2. Improve performance by limiting active tools
3. Provide better control over available operations`,

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
      mode: "dynamic_toolchange" as const,
    },
  },
];

export const server = await mcpc(
  [
    {
      name: "dynamic-toolchange-demo",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true, // Important: Enable tool list change notifications
        },
      },
    },
  ],
  toolDefinitions,
);

const transport = new StdioServerTransport();
await server.connect(transport);
