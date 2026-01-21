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

    const agent = getAgent(config?.agents, 0);
    assertEquals(
      agent.name,
      "_wonderwhy-er_desktop-commander--orchestrator",
    );
    const desktopConfig = agent.deps?.mcpServers
      ?.["_wonderwhy-er_desktop-commander"] as any;
    assertEquals(desktopConfig?.command, "npx");
    assertEquals(desktopConfig?.args, [
      "-y",
      "@wonderwhy-er/desktop-commander",
    ]);
    assertEquals(
      agent.deps?.mcpServers?.["_wonderwhy-er_desktop-commander"]
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

    const agent = getAgent(config?.agents, 0);
    assertEquals(
      agent.name,
      "_wonderwhy-er_desktop-commander__https___api_github_com_mcp__https___api_example_com_sse--orchestrator",
    );

    // Check that all three servers are configured
    const mcpServers = agent.deps?.mcpServers;
    assertExists(mcpServers);
    assertEquals(Object.keys(mcpServers || {}).length, 3);

    // Check first server (stdio)
    const desktopCmdConfig = mcpServers
      ?.["_wonderwhy-er_desktop-commander"] as any;
    assertEquals(desktopCmdConfig?.command, "npx");
    assertEquals(desktopCmdConfig?.args, [
      "-y",
      "@wonderwhy-er/desktop-commander",
    ]);
    assertEquals(
      mcpServers?.["_wonderwhy-er_desktop-commander"]?.transportType,
      "stdio",
    );

    // Check second server (http)
    const githubMcpConfig = mcpServers?.["https___api_github_com_mcp"] as any;
    assertEquals(githubMcpConfig?.command, "https://api.github.com/mcp");
    assertEquals(githubMcpConfig?.args, []);
    assertEquals(
      mcpServers?.["https___api_github_com_mcp"]?.transportType,
      "streamable-http",
    );

    // Check third server (sse)
    const sseConfig = mcpServers?.["https___api_example_com_sse"] as any;
    assertEquals(sseConfig?.command, "https://api.example.com/sse");
    assertEquals(sseConfig?.args, []);
    assertEquals(
      mcpServers?.["https___api_example_com_sse"]?.transportType,
      "sse",
    );

    // Check that refs include all servers
    const refs = agent.options?.refs || [];
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
