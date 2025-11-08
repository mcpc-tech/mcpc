/**
 * Example: Code Execution Mode (KISS Pattern)
 *
 * Demonstrates the simplified code execution pattern with clear parameter names.
 * This example shows how to:
 * 1. Use definitionsOf to get tool schemas
 * 2. Execute JavaScript code with hasDefinitions declaring known tools
 *
 * Based on: https://www.anthropic.com/engineering/code-execution-with-mcp
 *
 * Simple workflow:
 * 1. First call: { definitionsOf: ['read_file', 'move_file'] } - get schemas
 * 2. Second call: {
 *      code: 'const result = await callMCPTool("read_file", {...})',
 *      hasDefinitions: ['read_file']
 *    } - execute code
 *
 * Key benefits:
 * - Clear parameter names: definitionsOf, hasDefinitions, code
 * - Schema enforces: code requires hasDefinitions (non-empty)
 * - Both code and definitionsOf can be used together
 * - Simple, intuitive workflow
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ComposeDefinition, mcpc } from "../mod.ts";

export const toolDefinitions: ComposeDefinition[] = [
  {
    name: "file-organizer",
    description:
      `I am a smart file organizer that helps users manage their files efficiently.

Available tools:
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory"/>
<tool name="@wonderwhy-er/desktop-commander.move_file"/>
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file">

I can:
1. List directory contents to understand the current file structure
2. Create new directories for organization
3. Move files to appropriate folders based on type, date, or content
4. Delete unnecessary files after confirmation
5. Read file contents to understand what they contain
6. Create new files or modify existing ones

I always ask for confirmation before making destructive changes and provide clear explanations of what I'm doing.`,
    options: {
      mode: "code_execution",
    },
    deps: {
      mcpServers: {
        "@wonderwhy-er/desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          transportType: "stdio" as const,
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
      },
    },
  ],
  toolDefinitions,
);

const transport = new StdioServerTransport();
await server.connect(transport);
