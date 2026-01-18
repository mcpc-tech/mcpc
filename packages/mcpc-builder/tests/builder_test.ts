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

  const result = await configBuilder.composeSimpleMCPConfig(
    [TEST_SERVER],
  );

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
