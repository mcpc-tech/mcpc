/**
 * Integration tests for tool visibility classification
 * Tests the classification system for external, internal, hidden, and global tools
 */

import { assertEquals } from "@std/assert";
import { mcpc } from "../../mod.ts";
import type { ComposeEndContext } from "../../src/plugin-types.ts";
import { jsonSchema } from "ai";

Deno.test("Tool visibility - external tools classification", async () => {
  let capturedStats: ComposeEndContext["stats"] | undefined;

  await mcpc(
    [{ name: "test-visibility", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-visibility",
      description: "Test agent for visibility classification.",
      deps: { mcpServers: {} },
      options: { mode: "agentic" },
      plugins: [{
        name: "stats-capture",
        composeEnd: (context) => {
          capturedStats = context.stats;
        },
      }],
    }],
    (server) => {
      // Register tools with different visibility settings
      server.tool(
        "external-tool-1",
        "An external tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "result" }] }),
      );

      server.tool(
        "external-tool-2",
        "Another external tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "result" }] }),
      );

      server.tool(
        "internal-tool-1",
        "An internal tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "result" }] }),
        { internal: true },
      );

      server.tool(
        "hidden-tool-1",
        "A hidden tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "result" }] }),
      );
      server.configTool("hidden-tool-1", { visibility: { hidden: true } });
    },
  );

  // Verify stats were captured
  assertEquals(capturedStats !== undefined, true, "Stats should be captured");

  if (capturedStats) {
    // Verify total count - no MCP server tools, only directly registered ones
    assertEquals(capturedStats.totalTools, 4, "Should have 4 total tools");

    // Verify counts for each visibility type
    // In the new system: public tools are exposed to MCP clients, hidden tools are not
    // Regular context tools (like external-tool-1, external-tool-2) are neither public nor hidden
    assertEquals(
      capturedStats.publicTools,
      0,
      "Should have 0 public tools (none marked as public)",
    );
    assertEquals(
      capturedStats.hiddenTools,
      2,
      "Should have 2 hidden tools (internal + hide)",
    );
  }
});

Deno.test("Tool visibility - external tools from MCP servers", async () => {
  const loggingOutput: string[] = [];

  // Capture logging output
  const originalInfo = console.info;
  console.info = (...args: any[]) => {
    loggingOutput.push(args.join(" "));
  };

  try {
    // Note: This test would work better with real MCP servers
    // For now, we test with directly registered tools that simulate external tools
    await mcpc(
      [{ name: "test-server", version: "1.0.0" }, {}],
      [
        {
          name: "test-agent",
          description: "Agent with external tools",
          deps: { mcpServers: {} },
        },
      ],
      (server) => {
        // Simulate external tools from MCP servers
        // These would normally come from composeMcpDepTools()
        server.tool(
          "desktop-commander_read_file",
          "Read file",
          jsonSchema({ type: "object", properties: {} }),
          () => ({ content: [{ type: "text", text: "file content" }] }),
        );

        server.tool(
          "desktop-commander_write_file",
          "Write file",
          jsonSchema({ type: "object", properties: {} }),
          () => ({ content: [{ type: "text", text: "written" }] }),
        );

        server.tool(
          "github_create_pull_request",
          "Create PR",
          jsonSchema({ type: "object", properties: {} }),
          () => ({ content: [{ type: "text", text: "PR created" }] }),
        );
      },
    );

    // Find the logging output that shows external tools
    const externalToolsLog = loggingOutput.find((line) =>
      line.includes("External:")
    );

    if (externalToolsLog) {
      // Verify it lists the tools as external
      assertEquals(
        externalToolsLog.includes("desktop-commander_read_file"),
        true,
        "Should list read_file as external",
      );
      assertEquals(
        externalToolsLog.includes("desktop-commander_write_file"),
        true,
        "Should list write_file as external",
      );
      assertEquals(
        externalToolsLog.includes("github_create_pull_request"),
        true,
        "Should list create_pull_request as external",
      );
    }
  } finally {
    console.info = originalInfo;
  }
});

Deno.test("Tool visibility - tools without explicit config are context tools", async () => {
  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    (server) => {
      // Register tools without any visibility config
      // These should be regular context tools (not public, not hidden)
      server.tool(
        "tool-without-config-1",
        "Tool 1",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "1" }] }),
      );

      server.tool(
        "tool-without-config-2",
        "Tool 2",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "2" }] }),
      );
    },
  );

  const hiddenList = server.getHiddenToolNames();
  const publicList = server.getPublicToolNames();

  // Tools without config should not be public or hidden
  assertEquals(publicList.includes("tool-without-config-1"), false);
  assertEquals(publicList.includes("tool-without-config-2"), false);
  assertEquals(hiddenList.includes("tool-without-config-1"), false);
  assertEquals(hiddenList.includes("tool-without-config-2"), false);
});

Deno.test("Tool visibility - logging plugin displays correct categories", async () => {
  const loggingOutput: string[] = [];

  // Capture logging output
  const originalInfo = console.info;
  console.info = (...args: any[]) => {
    loggingOutput.push(args.join(" "));
  };

  try {
    await mcpc(
      [{ name: "test-server", version: "1.0.0" }, {}],
      [
        {
          name: "visibility-test",
          description: "Test visibility logging",
          deps: { mcpServers: {} },
        },
      ],
      (server) => {
        // Create one of each type (except global which requires MCP deps)
        server.tool(
          "ext",
          "External",
          jsonSchema({ type: "object", properties: {} }),
          () => ({ content: [{ type: "text", text: "ext" }] }),
        );

        server.tool(
          "int",
          "Internal",
          jsonSchema({ type: "object", properties: {} }),
          () => ({ content: [{ type: "text", text: "int" }] }),
          { internal: true },
        );

        server.tool(
          "hid",
          "Hidden",
          jsonSchema({ type: "object", properties: {} }),
          () => ({ content: [{ type: "text", text: "hid" }] }),
        );
        server.configTool("hid", { visibility: { hidden: true } });
      },
    );

    // Find the composition complete log
    const compositionLog = loggingOutput.find((line) =>
      line.includes("Composition complete")
    );

    if (compositionLog) {
      // The new system has only Public and Hidden categories
      // Tools marked with {internal: true} are now hidden
      // Regular tools without config are context tools (not logged separately)

      // Find the hidden tools line (both internal and hidden tools)
      const hiddenLine = loggingOutput.find((line) =>
        line.includes("├─ Hidden:")
      );
      if (hiddenLine) {
        assertEquals(
          hiddenLine.includes("int") && hiddenLine.includes("hid"),
          true,
          "Should show both hidden tools (int and hid)",
        );
      }

      // Find stats line showing counts
      const totalLine = loggingOutput.find((line) =>
        line.includes("Total: 3 tools")
      );
      assertEquals(totalLine !== undefined, true, "Should show total count");
    }
  } finally {
    console.info = originalInfo;
  }
});

Deno.test("Tool visibility - only non-internal tools are exposed to MCP client", async () => {
  const server = await mcpc(
    [{ name: "test-public-exposure", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
    }],
    (server) => {
      // Register public tool (should be exposed)
      server.tool(
        "public-tool",
        "A public tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "public" }] }),
      );

      // Register internal tool (should NOT be exposed)
      server.tool(
        "internal-tool",
        "An internal tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "internal" }] }),
        { internal: true },
      );

      // Register another public tool
      server.tool(
        "another-public",
        "Another public tool",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "public2" }] }),
      );
    },
  );

  // Get the actual list of tools exposed to MCP clients via the internal toolManager
  // This is what ListToolsRequestSchema handler returns
  const publicTools = (server as any).toolManager.getPublicTools();
  const publicToolNames = publicTools.map((t: any) => t.name);

  // Should only expose non-internal tools
  assertEquals(
    publicToolNames.length,
    3,
    "Should expose 3 tools (2 public + 1 agent)",
  );
  assertEquals(
    publicToolNames.includes("public-tool"),
    true,
    "Should expose public-tool",
  );
  assertEquals(
    publicToolNames.includes("another-public"),
    true,
    "Should expose another-public",
  );
  assertEquals(
    publicToolNames.includes("test-agent"),
    true,
    "Should expose agent tool",
  );

  // Internal tool should NOT be in the public list
  assertEquals(
    publicToolNames.includes("internal-tool"),
    false,
    "Should NOT expose internal-tool to MCP clients",
  );
});
