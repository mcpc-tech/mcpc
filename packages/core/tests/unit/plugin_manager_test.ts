/**
 * Unit tests for PluginManager
 * Tests plugin registration, validation, and lifecycle management
 */

import { assertEquals, assertRejects } from "@std/assert";
import { mcpcLegacy as mcpc } from "../../mod.ts";
import type { ToolPlugin } from "../../src/plugin-types.ts";

Deno.test("PluginManager - register valid plugin", async () => {
  const testPlugin: ToolPlugin = {
    name: "test-plugin",
    version: "1.0.0",
    configureServer: () => {
      // Simple configuration
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server) => {
      await server.addPlugin(testPlugin);
    },
  );

  // Verify plugin was registered (we can't directly access pluginManager, so we test indirectly)
  // The server should have been created successfully
  assertEquals(typeof server.callTool, "function");
});

Deno.test("PluginManager - reject invalid plugin without name", async () => {
  const invalidPlugin = {
    configureServer: () => {},
  } as unknown as ToolPlugin;

  await assertRejects(
    async () => {
      await mcpc(
        [{ name: "test-server", version: "1.0.0" }, {}],
        [],
        async (server) => {
          await server.addPlugin(invalidPlugin);
        },
      );
    },
    Error,
    "Invalid plugin",
  );
});

Deno.test("PluginManager - reject invalid plugin without hooks", async () => {
  const invalidPlugin = {
    name: "no-hooks-plugin",
  } as unknown as ToolPlugin;

  await assertRejects(
    async () => {
      await mcpc(
        [{ name: "test-server", version: "1.0.0" }, {}],
        [],
        async (server) => {
          await server.addPlugin(invalidPlugin);
        },
      );
    },
    Error,
    "Invalid plugin",
  );
});

Deno.test("PluginManager - handle duplicate plugin registration", async () => {
  const testPlugin: ToolPlugin = {
    name: "duplicate-test",
    configureServer: () => {},
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server) => {
      await server.addPlugin(testPlugin);
      // Try to add the same plugin again - should skip silently
      await server.addPlugin(testPlugin);
    },
  );

  assertEquals(typeof server.callTool, "function");
});

Deno.test("PluginManager - validate plugin dependencies", async () => {
  const dependentPlugin: ToolPlugin = {
    name: "dependent",
    dependencies: ["missing-plugin"],
    configureServer: () => {},
  };

  await assertRejects(
    async () => {
      await mcpc(
        [{ name: "test-server", version: "1.0.0" }, {}],
        [],
        async (server) => {
          await server.addPlugin(dependentPlugin);
        },
      );
    },
    Error,
    "missing dependencies",
  );
});

Deno.test("PluginManager - plugins with enforce order", async () => {
  const prePlugin: ToolPlugin = {
    name: "pre-plugin",
    enforce: "pre",
    composeStart: () => {},
  };

  const postPlugin: ToolPlugin = {
    name: "post-plugin",
    enforce: "post",
    composeStart: () => {},
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server) => {
      await server.addPlugin(postPlugin);
      await server.addPlugin(prePlugin);
      // Despite the order, pre should execute before post
    },
  );

  assertEquals(typeof server.callTool, "function");
});

Deno.test("PluginManager - conditional plugin application", async () => {
  const agenticOnlyPlugin: ToolPlugin = {
    name: "agentic-only",
    apply: "agentic",
    composeStart: () => {},
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server) => {
      await server.addPlugin(agenticOnlyPlugin);
    },
  );

  assertEquals(typeof server.callTool, "function");
});

Deno.test("PluginManager - plugin configureServer hook execution", async () => {
  let configureServerCalled = false;

  const plugin: ToolPlugin = {
    name: "configure-test",
    configureServer: () => {
      configureServerCalled = true;
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    async (server) => {
      await server.addPlugin(plugin);
    },
  );

  assertEquals(configureServerCalled, true);
});

Deno.test("PluginManager - handle configureServer errors", async () => {
  const faultyPlugin: ToolPlugin = {
    name: "faulty-config",
    configureServer: () => {
      throw new Error("Configuration failed!");
    },
  };

  await assertRejects(
    async () => {
      await mcpc(
        [{ name: "test-server", version: "1.0.0" }, {}],
        [],
        async (server) => {
          await server.addPlugin(faultyPlugin);
        },
      );
    },
    Error,
    "configuration failed",
  );
});
