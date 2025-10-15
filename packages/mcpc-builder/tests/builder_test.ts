/**
 * Tests for MCPC Builder
 */

import { assertEquals, assertExists } from "@std/assert";
import { registryClient } from "../src/registry-client.ts";
import { configBuilder } from "../src/config-builder.ts";

// Note: These tests require network access to mcpc.tech
// Run with: deno test --allow-net

// Use a real server name from the registry
const TEST_SERVER = "io.github.wonderwhy-er/desktop-commander";

Deno.test("Registry Client - Search servers", async () => {
  const result = await registryClient.searchServers("file", "read", 5);

  assertExists(result);
  assertExists(result.servers);
  assertEquals(typeof result.total, "number");
  assertEquals(typeof result.hasMore, "boolean");
});

Deno.test("Registry Client - Get server details", async () => {
  const result = await registryClient.getServerDetails(TEST_SERVER);

  assertExists(result);
  assertExists(result.description);
  assertExists(result.toolNames);
});

Deno.test("Registry Client - Get server capabilities", async () => {
  const result = await registryClient.getServerCapabilities(TEST_SERVER);

  assertExists(result);
  assertExists(result.capabilities);
  // Capabilities should have at least one of: tools, resources, prompts
  const caps = result.capabilities;
  const hasCapabilities = caps.tools || caps.resources || caps.prompts;
  assertEquals(!!hasCapabilities, true);
});

Deno.test("Config Builder - Compose simple MCP config", async () => {
  const result = await configBuilder.composeSimpleMCPConfig(
    [TEST_SERVER],
    {
      [TEST_SERVER]: {
        "HOME": "/home/user",
      },
    },
  );

  assertExists(result);
  assertExists(result.mcpServers);
  assertExists(result.mcpServers[TEST_SERVER]);
  assertEquals(result.mcpServers[TEST_SERVER].env?.HOME, "/home/user");
});

Deno.test("Config Builder - Compose MCPC config", async () => {
  const result = await configBuilder.composeMCPCConfig(
    "test-agent",
    "test-tool",
    "A test agent for file operations",
    [TEST_SERVER],
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
});
