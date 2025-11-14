import { assertEquals, assertExists } from "@std/assert";
import { loadConfig } from "../src/config/loader.ts";
import process from "node:process";

Deno.test("Config Loader - load from MCPC_CONFIG env var", async () => {
  // Setup
  const testConfig = [
    {
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
    },
  ];
  process.env.MCPC_CONFIG = JSON.stringify(testConfig);

  // Test
  const config = await loadConfig();

  // Verify
  assertExists(config);
  assertEquals(config.name, "mcpc-server");
  assertEquals(config.version, "0.1.0");
  assertEquals(config.agents.length, 1);
  assertEquals(config.agents[0].name, "test-agent");

  // Cleanup
  delete process.env.MCPC_CONFIG;
});

Deno.test("Config Loader - environment variable substitution", async () => {
  // Setup
  process.env.TEST_COMMAND = "npx";
  process.env.TEST_URL = "https://test.com";

  const testConfig = {
    name: "test-server",
    version: "1.0.0",
    agents: [
      {
        name: "agent",
        description: "Command: $TEST_COMMAND",
        deps: {
          mcpServers: {
            server: {
              command: "$TEST_COMMAND",
              args: ["-y", "test"],
              transportType: "stdio",
            },
          },
        },
      },
    ],
  };
  process.env.MCPC_CONFIG = JSON.stringify(testConfig);

  // Test
  const config = await loadConfig();

  // Verify
  assertExists(config);
  assertEquals(config.agents[0].description, "Command: npx");
  const serverConfig = config.agents[0].deps?.mcpServers?.server as any;
  assertEquals(serverConfig?.command, "npx");

  // Cleanup
  delete process.env.MCPC_CONFIG;
  delete process.env.TEST_COMMAND;
  delete process.env.TEST_URL;
});

Deno.test("Config Loader - array format normalization", async () => {
  // Setup - using array format
  const testConfig = [
    { name: "agent1", description: "First", deps: { mcpServers: {} } },
    { name: "agent2", description: "Second", deps: { mcpServers: {} } },
  ];
  process.env.MCPC_CONFIG = JSON.stringify(testConfig);

  // Test
  const config = await loadConfig();

  // Verify
  assertExists(config);
  assertEquals(config.name, "mcpc-server"); // Default name
  assertEquals(config.version, "0.1.0"); // Default version
  assertEquals(config.agents.length, 2);
  assertEquals(config.agents[0].name, "agent1");
  assertEquals(config.agents[1].name, "agent2");

  // Cleanup
  delete process.env.MCPC_CONFIG;
});

Deno.test("Config Loader - object format", async () => {
  // Setup - using object format
  const testConfig = {
    name: "custom-server",
    version: "2.0.0",
    capabilities: { tools: {}, sampling: {} },
    agents: [{ name: "agent", description: "Test", deps: { mcpServers: {} } }],
  };
  process.env.MCPC_CONFIG = JSON.stringify(testConfig);

  // Test
  const config = await loadConfig();

  // Verify
  assertExists(config);
  assertEquals(config.name, "custom-server");
  assertEquals(config.version, "2.0.0");
  assertExists(config.capabilities);
  assertEquals(config.agents.length, 1);

  // Cleanup
  delete process.env.MCPC_CONFIG;
});

Deno.test("Config Loader - no config returns null", async () => {
  // Ensure no config sources are set
  delete process.env.MCPC_CONFIG;
  delete process.env.MCPC_CONFIG_URL;
  delete process.env.MCPC_CONFIG_FILE;

  // Test
  const config = await loadConfig();

  // Verify - should return null when no config found
  assertEquals(config, null);
});

Deno.test("Config Loader - nested environment variable substitution", async () => {
  // Setup
  process.env.PREFIX = "test";
  process.env.SUFFIX = "value";

  const testConfig = {
    name: "$PREFIX-server",
    version: "1.0.0",
    agents: [
      {
        name: "$PREFIX-$SUFFIX",
        description: "Nested: $PREFIX and $SUFFIX",
        deps: { mcpServers: {} },
      },
    ],
  };
  process.env.MCPC_CONFIG = JSON.stringify(testConfig);

  // Test
  const config = await loadConfig();

  // Verify
  assertExists(config);
  assertEquals(config.name, "test-server");
  assertEquals(config.agents[0].name, "test-value");
  assertEquals(config.agents[0].description, "Nested: test and value");

  // Cleanup
  delete process.env.MCPC_CONFIG;
  delete process.env.PREFIX;
  delete process.env.SUFFIX;
});
