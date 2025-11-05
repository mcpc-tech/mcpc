/**
 * MCPC Example 01: Basic File Manager
 *
 * Demonstrates the fundamental MCPC features:
 * - Basic server creation and composition
 * - Dependency management with external MCP servers
 * - Simple tool orchestration with file operations
 * - Tool selection using <tool> tags
 *
 * This creates a smart file organizer that can manage files efficiently.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../../mod.ts";
import type { ComposeDefinition } from "../../src/set-up-mcp-compose.ts";

export const toolDefinitions: ComposeDefinition[] = [
  {
    name: "file-organizer",
    options: {
      mode: "agentic_sampling",
    },
    description:
      `I am a smart file organizer that helps users manage their files efficiently.

Available tools:
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory"/>
<tool name="@wonderwhy-er/desktop-commander.move_file"/>
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>

I can:
1. List directory contents to understand the current file structure
2. Create new directories for organization
3. Move files to appropriate folders based on type, date, or content
4. Delete unnecessary files after confirmation
5. Read file contents to understand what they contain
6. Create new files or modify existing ones

I always ask for confirmation before making destructive changes and provide clear explanations of what I'm doing.`,

    deps: {
      mcpServers: {
        "@wonderwhy-er/desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio",
        },
      },
    },
  },
];

export const server = await mcpc(
  [
    {
      name: "basic-file-manager",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
        sampling: {},
      },
    },
  ],
  toolDefinitions,
);

const transport = new StdioServerTransport();
await server.connect(transport);
