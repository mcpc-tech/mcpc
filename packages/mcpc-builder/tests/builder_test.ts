/**
 * Tests for MCPC Builder
 */

import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client";
import { registryClient } from "../src/registry-client.ts";
import { configBuilder } from "../src/config-builder.ts";
import { createServer as createBuilderServer } from "../src/server.ts";

// Note: These tests require network access to mcpc.tech
// Run with: deno test --allow-net

// Use a real server name from the registry
const TEST_SERVER = "io.github.wonderwhy-er/desktop-commander";

// Helper to check if network is available
async function isNetworkAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch("https://mcpc.tech/health", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // Consume the response body to avoid leaks
    await resp.text();
    return true;
  } catch {
    return false;
  }
}

async function createConnectedBuilderClient() {
  const server = createBuilderServer();
  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({
    name: "builder-test-client",
    version: "1.0.0",
  });

  await client.connect(clientTransport);

  return { client, server };
}

function extractTextContent(
  result: { content?: unknown; toolResult?: unknown },
): string {
  const payload =
    typeof result.toolResult === "object" && result.toolResult !== null
      ? result.toolResult
      : result;
  const content =
    typeof payload === "object" && payload !== null && "content" in payload
      ? (payload as { content?: unknown }).content
      : undefined;

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        "text" in block &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

Deno.test("Builder MCP server - exposes builder tools to MCP clients", async () => {
  const { client, server } = await createConnectedBuilderClient();

  try {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();

    assertEquals(toolNames, [
      "compose_mcpc_config",
      "get_env_var_schemas",
      "search_mcp_servers",
    ]);

    const composeTool = tools.tools.find((tool) =>
      tool.name === "compose_mcpc_config"
    );
    assertExists(composeTool);
    assertEquals(composeTool.inputSchema.type, "object");
    assertEquals(
      composeTool.inputSchema.required?.includes("serverName"),
      true,
    );
    assertEquals(
      composeTool.inputSchema.required?.includes("toolSelection"),
      true,
    );
  } finally {
    await client.close();
    await server.close();
  }
});

Deno.test("Builder MCP server - search_mcp_servers returns formatted results via client", async () => {
  const originalSearchServers = registryClient.searchServers;
  registryClient.searchServers = () => Promise.resolve({
    total: 1,
    hasMore: false,
    servers: [
      {
        name: "demo/server",
        description: "Demo registry entry",
        toolNames: ["read_file", "write_file"],
      },
    ],
  });

  const { client, server } = await createConnectedBuilderClient();

  try {
    const result = await client.callTool({
      name: "search_mcp_servers",
      arguments: {
        serverQuery: "demo",
        toolQuery: "read",
        limit: 5,
      },
    });

    const text = extractTextContent(result);

    assertStringIncludes(text, "Found 1 server(s)");
    assertStringIncludes(text, "demo/server");
    assertStringIncludes(text, "read_file, write_file");
  } finally {
    registryClient.searchServers = originalSearchServers;
    await client.close();
    await server.close();
  }
});

Deno.test("Builder MCP server - get_env_var_schemas returns registry data via client", async () => {
  const originalGetEnvVarSchemas = registryClient.getEnvVarSchemas;
  registryClient.getEnvVarSchemas = () => Promise.resolve({
    github: [{
      name: "GITHUB_TOKEN",
      isRequired: true,
      isSecret: true,
    }],
  });

  const { client, server } = await createConnectedBuilderClient();

  try {
    const result = await client.callTool({
      name: "get_env_var_schemas",
      arguments: {
        serverNames: ["github"],
      },
    });

    const text = extractTextContent(result);

    assertStringIncludes(text, '"github"');
    assertStringIncludes(text, '"GITHUB_TOKEN"');
  } finally {
    registryClient.getEnvVarSchemas = originalGetEnvVarSchemas;
    await client.close();
    await server.close();
  }
});

Deno.test("Builder MCP server - compose_mcpc_config writes markdown config via client", async () => {
  const originalComposeMCPCConfig = configBuilder.composeMCPCConfig;
  const originalGenerateMarkdownConfig = configBuilder.generateMarkdownConfig;
  const originalHome = Deno.env.get("HOME");
  const tempHome = await Deno.makeTempDir();

  configBuilder.composeMCPCConfig = () => Promise.resolve({
    config: {
      name: "demo-server",
      version: "1.0.0",
      agents: [
        {
          name: "demo-tool",
          description: "Demo builder config",
          deps: {
            mcpServers: {
              github: {
                command: "npx",
                args: ["-y", "@demo/github"],
                transportType: "stdio" as const,
              },
            },
          },
          options: {
            mode: "agentic" as const,
          },
        },
      ],
    },
    requiredVars: [
      {
        serverName: "github",
        type: "env" as const,
        name: "GITHUB_TOKEN",
        description: "GitHub token",
        isSecret: true,
      },
    ],
    mcpServers: {
      github: {
        command: "npx",
        args: ["-y", "@demo/github"],
        transportType: "stdio" as const,
      },
    },
    toolReferences: ['<tool name="github.__ALL__"/>'],
  });

  configBuilder.generateMarkdownConfig = () =>
    `---
name: demo-server
description: Demo builder config
mode: agentic
---

# demo-server

Demo builder config

## Available Tools

<tool name="github.__ALL__"/>
`;

  Deno.env.set("HOME", tempHome);

  const { client, server } = await createConnectedBuilderClient();

  try {
    const result = await client.callTool({
      name: "compose_mcpc_config",
      arguments: {
        serverName: "demo-server",
        toolName: "demo-tool",
        description: "Demo builder config",
        serverDeps: ["github"],
        toolSelection: [
          {
            serverName: "github",
            tools: "__ALL__",
          },
        ],
        mode: "agentic",
        manual: "Use this config carefully.",
      },
    });

    const text = extractTextContent(result);

    const generatedPath = `${tempHome}/.mcpc/demo-server.md`;
    const writtenFile = await Deno.readTextFile(generatedPath);

    assertStringIncludes(text, "MCPC Configuration Generated");
    assertStringIncludes(text, generatedPath);
    assertStringIncludes(text, "GITHUB_TOKEN");
    assertStringIncludes(text, "claude mcp add --transport stdio demo-server");
    assertStringIncludes(writtenFile, "name: demo-server");
    assertStringIncludes(writtenFile, '<tool name="github.__ALL__"/>');
  } finally {
    configBuilder.composeMCPCConfig = originalComposeMCPCConfig;
    configBuilder.generateMarkdownConfig = originalGenerateMarkdownConfig;
    if (originalHome === undefined) {
      Deno.env.delete("HOME");
    } else {
      Deno.env.set("HOME", originalHome);
    }
    await client.close();
    await server.close();
    await Deno.remove(tempHome, { recursive: true });
  }
});

Deno.test("Registry Client - Search servers", async () => {
  if (!(await isNetworkAvailable())) {
    console.log("Skipping test: network unavailable");
    return;
  }

  const result = await registryClient.searchServers("file", "read", 5);

  assertExists(result);
  assertExists(result.servers);
  assertEquals(typeof result.total, "number");
  assertEquals(typeof result.hasMore, "boolean");
});

Deno.test("Registry Client - Get server details", async () => {
  if (!(await isNetworkAvailable())) {
    console.log("Skipping test: network unavailable");
    return;
  }

  const result = await registryClient.getServerDetails(TEST_SERVER);

  assertExists(result);
  assertExists(result.description);
  assertExists(result.toolNames);
});

Deno.test("Registry Client - Get server capabilities", async () => {
  if (!(await isNetworkAvailable())) {
    console.log("Skipping test: network unavailable");
    return;
  }

  const result = await registryClient.getServerCapabilities(TEST_SERVER);

  assertExists(result);
  assertExists(result.capabilities);
  // Capabilities should have at least one of: tools, resources, prompts
  const caps = result.capabilities;
  const hasCapabilities = caps.tools || caps.resources || caps.prompts;
  assertEquals(!!hasCapabilities, true);
});

Deno.test("Config Builder - Compose simple MCP config", async () => {
  if (!(await isNetworkAvailable())) {
    console.log("Skipping test: network unavailable");
    return;
  }

  const result = await configBuilder.composeSimpleMCPConfig([
    TEST_SERVER,
  ]);

  assertExists(result);
  assertExists(result.mcpServers);
  assertExists(result.mcpServers[TEST_SERVER]);
  // Should have generated placeholders if required env vars exist
  if (result.mcpServers[TEST_SERVER].env) {
    assertExists(result.mcpServers[TEST_SERVER].env);
  }
});

Deno.test("Config Builder - Compose MCPC config", async () => {
  if (!(await isNetworkAvailable())) {
    console.log("Skipping test: network unavailable");
    return;
  }

  const { config: result, requiredVars } = await configBuilder
    .composeMCPCConfig(
      "test-agent",
      "test-tool",
      "A test agent for file operations",
      [TEST_SERVER],
      [{
        serverName: TEST_SERVER,
        tools: "__ALL__",
      }],
      {
        mode: "agentic",
        enableSampling: true,
      },
    );

  assertExists(result);
  assertEquals(result.name, "test-agent");
  assertEquals(result.agents[0].name, "test-tool");
  assertEquals(result.agents[0].options?.mode, "agentic");
  assertEquals(result.agents[0].options?.sampling, true);
  assertExists(result.agents[0].deps.mcpServers[TEST_SERVER]);

  // requiredVars should be an array
  assertExists(requiredVars);
  assertEquals(Array.isArray(requiredVars), true);
});
