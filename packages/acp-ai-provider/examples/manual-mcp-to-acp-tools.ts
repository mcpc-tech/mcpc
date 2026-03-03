/**
 * Example: Connect to MCP server, get tools, convert to ACP tools
 *
 * Run: deno run -A packages/acp-ai-provider/examples/manual-mcp-to-acp-tools.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createACPProvider } from "../src/provider.ts";
import { acpTools } from "../src/acp-tool.ts";
import { jsonSchema, streamText, tool } from "ai";
import process from "node:process";

function convertMCPTool(mcpTool: Tool, client: Client) {
  return tool({
    description: mcpTool.description || mcpTool.name,
    inputSchema: jsonSchema(mcpTool.inputSchema),
    execute: (args) =>
      client.callTool({
        name: mcpTool.name,
        arguments: args as Record<string, unknown>,
      }),
  });
}

async function main() {
  // Connect to MCP server
  const mcpClient = new Client(
    { name: "acp-example-client", version: "1.0.0" },
    { capabilities: {} },
  );

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()],
  });

  await mcpClient.connect(transport);

  // Get and convert tools
  const { tools: mcpTools } = await mcpClient.listTools();
  console.log(`Connected. Found ${mcpTools.length} tools.`);

  const aiTools = {} as Parameters<typeof acpTools>[0];
  for (const mcpTool of mcpTools) {
    aiTools[mcpTool.name] = convertMCPTool(mcpTool, mcpClient);
  }

  // Create ACP provider
  const provider = createACPProvider({
    command: "claude-agent-acp",
    args: [],
    session: { cwd: process.cwd(), mcpServers: [] },
  });

  // Run with tools
  const prompt = process.env.PROMPT ||
    "List files in current directory using read_directory or list_allowed_directories.";

  try {
    const { textStream, steps } = streamText({
      model: provider.languageModel(
        process.env.ACP_MODEL,
        process.env.ACP_MODE,
      ),
      prompt,
      tools: acpTools(aiTools),
    });

    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }

    const result = await steps;
    const toolCalls = result.flatMap((s) => s.toolCalls).filter(Boolean);
    console.log(`\n\nCalled ${toolCalls.length} tools:`, toolCalls);
  } finally {
    provider.cleanup();
    await mcpClient.close();
  }
}

main().catch(console.error);
