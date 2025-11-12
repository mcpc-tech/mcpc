import { assertEquals, assertExists } from "@std/assert";
import { loadConfig } from "../src/config/loader.ts";
import process from "node:process";

Deno.test("wrap mode - parse single server command correctly", async () => {
  // Save original argv
  const originalArgv = process.argv;

  try {
    // Mock process.argv for wrap mode
    const mockArgv = [
      "deno",
      "run",
      "--wrap",
      "--mcp-stdio",
      "npx -y @wonderwhy-er/desktop-commander",
    ];

    // Set process.argv
    Object.defineProperty(process, "argv", {
      value: mockArgv,
      configurable: true,
      writable: true,
    });

    const config = await loadConfig();

    assertExists(config);
    assertEquals(config?.name, "mcpc-wrap-config");
    assertEquals(config?.agents.length, 1);
    assertEquals(
      config?.agents[0].name,
      "_wonderwhy-er_desktop-commander--orchestrator",
    );
    assertEquals(
      config?.agents[0].deps?.mcpServers?.["_wonderwhy-er_desktop-commander"]
        ?.command,
      "npx",
    );
    assertEquals(
      config?.agents[0].deps?.mcpServers?.["_wonderwhy-er_desktop-commander"]
        ?.args,
      ["-y", "@wonderwhy-er/desktop-commander"],
    );
    assertEquals(
      config?.agents[0].deps?.mcpServers?.["_wonderwhy-er_desktop-commander"]
        ?.transportType,
      "stdio",
    );
  } finally {
    // Restore original argv
    Object.defineProperty(process, "argv", {
      value: originalArgv,
      configurable: true,
      writable: true,
    });
  }
});

Deno.test("wrap mode - parse multiple servers with different transports", async () => {
  // Save original argv
  const originalArgv = process.argv;

  try {
    // Mock process.argv for wrap mode with multiple servers
    const mockArgv = [
      "deno",
      "run",
      "--wrap",
      "--mcp-stdio",
      "npx -y @wonderwhy-er/desktop-commander",
      "--mcp-http",
      "https://api.github.com/mcp",
      "--mcp-sse",
      "https://api.example.com/sse",
    ];

    // Set process.argv
    Object.defineProperty(process, "argv", {
      value: mockArgv,
      configurable: true,
      writable: true,
    });

    const config = await loadConfig();

    assertExists(config);
    // Should create a multi-server wrapper config
    assertEquals(config?.name, "mcpc-wrap-config");
    assertEquals(config?.agents.length, 1);
    assertEquals(
      config?.agents[0].name,
      "_wonderwhy-er_desktop-commander__https___api_github_com_mcp__https___api_example_com_sse--orchestrator",
    );

    // Check that all three servers are configured
    const mcpServers = config?.agents[0].deps?.mcpServers;
    assertExists(mcpServers);
    assertEquals(Object.keys(mcpServers || {}).length, 3);

    // Check first server (stdio)
    assertEquals(
      mcpServers?.["_wonderwhy-er_desktop-commander"]?.command,
      "npx",
    );
    assertEquals(mcpServers?.["_wonderwhy-er_desktop-commander"]?.args, [
      "-y",
      "@wonderwhy-er/desktop-commander",
    ]);
    assertEquals(
      mcpServers?.["_wonderwhy-er_desktop-commander"]?.transportType,
      "stdio",
    );

    // Check second server (http)
    assertEquals(
      mcpServers?.["https___api_github_com_mcp"]?.command,
      "https://api.github.com/mcp",
    );
    assertEquals(mcpServers?.["https___api_github_com_mcp"]?.args, []);
    assertEquals(
      mcpServers?.["https___api_github_com_mcp"]?.transportType,
      "streamable-http",
    );

    // Check third server (sse)
    assertEquals(
      mcpServers?.["https___api_example_com_sse"]?.command,
      "https://api.example.com/sse",
    );
    assertEquals(mcpServers?.["https___api_example_com_sse"]?.args, []);
    assertEquals(
      mcpServers?.["https___api_example_com_sse"]?.transportType,
      "sse",
    );

    // Check that refs include all servers
    const refs = config?.agents[0].options?.refs || [];
    assertEquals(refs.length, 3);
  } finally {
    // Restore original argv
    Object.defineProperty(process, "argv", {
      value: originalArgv,
      configurable: true,
      writable: true,
    });
  }
});
