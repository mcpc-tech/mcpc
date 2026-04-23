import { assertEquals, assertExists } from "@std/assert";
import { loadConfig } from "../src/config/loader.ts";
import type { ComposeDefinition } from "@mcpc/core";
import process from "node:process";

// Helper to get agent as ComposeDefinition (not string)
function getAgent(
  agents: (string | ComposeDefinition)[] | undefined,
  index: number,
): ComposeDefinition {
  const agent = agents?.[index];
  if (!agent || typeof agent === "string") {
    throw new Error("Expected ComposeDefinition, got string or undefined");
  }
  return agent;
}

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
  assertEquals(getAgent(config.agents, 0).name, "test-agent");

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
  const agent = getAgent(config.agents, 0);
  assertEquals(agent.description, "Command: npx");
  const serverConfig = agent.deps?.mcpServers?.server as any;
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
  assertEquals(getAgent(config.agents, 0).name, "agent1");
  assertEquals(getAgent(config.agents, 1).name, "agent2");

  // Cleanup
  delete process.env.MCPC_CONFIG;
});

Deno.test("Config Loader - object format", async () => {
  // Setup - using object format
  const testConfig = {
    name: "custom-server",
    version: "2.0.0",
    capabilities: { tools: {} },
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
  // Save original argv and cwd
  const originalArgv = process.argv;
  const originalCwd = Deno.cwd();

  // Create a temp directory with no config files
  const tempDir = await Deno.makeTempDir();

  try {
    // Change to temp directory (no mcpc.config.json exists)
    Deno.chdir(tempDir);

    // Set clean argv without any flags
    Object.defineProperty(process, "argv", {
      value: ["deno", "run"],
      configurable: true,
      writable: true,
    });

    // Ensure no config sources are set
    delete process.env.MCPC_CONFIG;
    delete process.env.MCPC_CONFIG_URL;
    delete process.env.MCPC_CONFIG_FILE;

    // Temporarily rename user config if it exists
    const userConfigPath = `${Deno.env.get("HOME")}/.mcpc/config.json`;
    const userConfigBackup = `${userConfigPath}.backup`;
    let hadUserConfig = false;
    try {
      await Deno.rename(userConfigPath, userConfigBackup);
      hadUserConfig = true;
    } catch {
      // User config doesn't exist, that's fine
    }

    try {
      // Test
      const config = await loadConfig();

      // Verify - should return null when no config found
      assertEquals(config, null);
    } finally {
      // Restore user config if we backed it up
      if (hadUserConfig) {
        try {
          await Deno.rename(userConfigBackup, userConfigPath);
        } catch {
          // Ignore errors during restore
        }
      }
    }
  } finally {
    // Restore original cwd and argv
    Deno.chdir(originalCwd);
    Object.defineProperty(process, "argv", {
      value: originalArgv,
      configurable: true,
      writable: true,
    });

    // Cleanup temp directory
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  }
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
  const agent = getAgent(config.agents, 0);
  assertEquals(agent.name, "test-value");
  assertEquals(agent.description, "Nested: test and value");

  // Cleanup
  delete process.env.MCPC_CONFIG;
  delete process.env.PREFIX;
  delete process.env.SUFFIX;
});

Deno.test("Config Loader - --skills option parses comma-separated directories", async () => {
  // Save original argv
  const originalArgv = process.argv;

  try {
    // Set argv with --skills option
    Object.defineProperty(process, "argv", {
      value: [
        "deno",
        "run",
        "--skills",
        "./custom-skills,./more-skills, ./third ",
      ],
      configurable: true,
      writable: true,
    });

    // Provide a basic config via env var
    process.env.MCPC_CONFIG = JSON.stringify([
      { name: "test", description: "test", deps: { mcpServers: {} } },
    ]);

    const config = await loadConfig();

    // Verify skills are parsed and trimmed correctly
    assertExists(config);
    assertEquals(config.skills, [
      "./custom-skills",
      "./more-skills",
      "./third",
    ]);
  } finally {
    Object.defineProperty(process, "argv", {
      value: originalArgv,
      configurable: true,
      writable: true,
    });
    delete process.env.MCPC_CONFIG;
  }
});

Deno.test("Config Loader - --skills CLI overrides config.skills", async () => {
  const originalArgv = process.argv;

  try {
    Object.defineProperty(process, "argv", {
      value: ["deno", "run", "--skills", "./cli-skills"],
      configurable: true,
      writable: true,
    });

    // Config with skills defined
    process.env.MCPC_CONFIG = JSON.stringify({
      name: "test",
      skills: ["./config-skills"],
      agents: [{ name: "a", description: "", deps: { mcpServers: {} } }],
    });

    const config = await loadConfig();

    // CLI --skills should override config.skills
    assertExists(config);
    assertEquals(config.skills, ["./cli-skills"]);
  } finally {
    Object.defineProperty(process, "argv", {
      value: originalArgv,
      configurable: true,
      writable: true,
    });
    delete process.env.MCPC_CONFIG;
  }
});

Deno.test("Config Loader - default skills path when not specified", async () => {
  const originalArgv = process.argv;

  try {
    Object.defineProperty(process, "argv", {
      value: ["deno", "run"],
      configurable: true,
      writable: true,
    });

    // Config without skills
    process.env.MCPC_CONFIG = JSON.stringify([
      { name: "test", description: "", deps: { mcpServers: {} } },
    ]);

    const config = await loadConfig();

    // Should use default skills path
    assertExists(config);
    assertEquals(config.skills, [".agents/skills"]);
  } finally {
    Object.defineProperty(process, "argv", {
      value: originalArgv,
      configurable: true,
      writable: true,
    });
    delete process.env.MCPC_CONFIG;
  }
});

Deno.test("Config Loader - --cwd changes working directory", async () => {
  const originalArgv = process.argv;
  const originalCwd = Deno.cwd();
  const tempDir = await Deno.makeTempDir();

  try {
    // Create a config file in temp directory
    const configPath = `${tempDir}/mcpc.config.json`;
    await Deno.writeTextFile(
      configPath,
      JSON.stringify({
        name: "cwd-test-server",
        agents: [{
          name: "cwd-agent",
          description: "test",
          deps: { mcpServers: {} },
        }],
      }),
    );

    Object.defineProperty(process, "argv", {
      value: ["deno", "run", "--cwd", tempDir, "--config-file", configPath],
      configurable: true,
      writable: true,
    });

    // Ensure no other config sources
    delete process.env.MCPC_CONFIG;
    delete process.env.MCPC_CONFIG_FILE;
    delete process.env.MCPC_CONFIG_URL;

    const config = await loadConfig();

    // Should load config from temp directory
    assertExists(config);
    assertEquals(config.name, "cwd-test-server");
    assertEquals(getAgent(config.agents, 0).name, "cwd-agent");
  } finally {
    // Restore cwd and argv
    Deno.chdir(originalCwd);
    Object.defineProperty(process, "argv", {
      value: originalArgv,
      configurable: true,
      writable: true,
    });
    await Deno.remove(tempDir, { recursive: true });
  }
});
