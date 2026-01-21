/**
 * Example: MCPC - Basic Usage
 *
 * Demonstrates the single-configuration-object API pattern.
 *
 * Run:
 * ```bash
 * deno run --allow-all packages/core/examples/18-mcpc-basic.ts
 * ```
 */

import { mcpc } from "@mcpc/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Clean single configuration object
const server = await mcpc({
  // Server configuration (flat)
  name: "file-manager",
  version: "1.0.0",
  capabilities: {
    tools: { listChanged: true },
  },

  // Agent definitions
  agents: [
    {
      name: "file-organizer",
      description:
        `I am a smart file organizer that helps users manage their files efficiently.

Available tools:
<tool name="desktop-commander.list_directory"/>
<tool name="desktop-commander.create_directory"/>
<tool name="desktop-commander.move_file"/>
<tool name="desktop-commander.read_file"/>
<tool name="desktop-commander.write_file"/>

I can:
1. List directory contents to understand the current file structure
2. Create new directories for organization
3. Move files to appropriate folders based on type, date, or content
4. Read file contents to understand what they contain
5. Create new files or modify existing ones

I always ask for confirmation before making destructive changes.`,

      // MCP server dependencies (flat - no nested mcpServers)
      mcpServers: {
        "desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          // transportType defaults to "stdio" when command is provided
        },
      },

      // Agent-specific options (flat)
      mode: "agentic",
    },
  ],
});

// Connect to transport
const transport = new StdioServerTransport();
await server.connect(transport);
