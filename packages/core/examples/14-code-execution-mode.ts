/**
 * Example: Code Execution Mode with Progressive Disclosure
 *
 * Demonstrates the efficient code execution pattern from Anthropic's MCP guidelines.
 * This example shows how to:
 * 1. Use progressive disclosure to load only needed tools
 * 2. Process data in execution environment to reduce token usage
 * 3. Execute actual JavaScript code with MCP tool access
 *
 * Based on: https://www.anthropic.com/engineering/code-execution-with-mcp
 *
 * Key benefits vs traditional agentic mode:
 * - 98.7% reduction in token usage for tool definitions
 * - Data filtering/transformation happens before model sees results
 * - Familiar code patterns (loops, conditionals) vs chaining tool calls
 * - Actual code execution using new Function() - simple and effective
 */
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
