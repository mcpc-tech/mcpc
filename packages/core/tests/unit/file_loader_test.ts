/**
 * Unit tests for file loader registration system
 * Tests the generic file loader mechanism that supports multiple file formats
 */

import { assertEquals, assertRejects } from "@std/assert";
import { type ComposeDefinition, type FileLoader, mcpc } from "../../mod.ts";
import type { ToolPlugin } from "../../src/plugin-types.ts";

// Test file loader for .test extension
const testLoader: FileLoader = (filePath: string) => {
  return Promise.resolve({
    name: `test-agent-${filePath}`,
    description: `Loaded from ${filePath}`,
  });
};

// Test file loader for .yaml extension
const yamlLoader: FileLoader = (filePath: string) => {
  return Promise.resolve({
    name: `yaml-agent-${filePath}`,
    description: `YAML loaded from ${filePath}`,
  });
};

Deno.test("FileLoader - plugin can register loader via configureServer", async () => {
  const loaderPlugin: ToolPlugin = {
    name: "yaml-loader-plugin",
    version: "1.0.0",
    configureServer: (server) => {
      server.registerFileLoader(".yaml", yamlLoader);
      server.registerFileLoader(".yml", yamlLoader);
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    { plugins: [loaderPlugin] },
  );

  assertEquals(server.hasFileLoader(".yaml"), true);
  assertEquals(server.hasFileLoader(".yml"), true);
});

Deno.test("FileLoader - mcpc uses registered loader for file paths", async () => {
  // Register a loader for .agent extension
  const loadedFiles: string[] = [];
  const agentLoader: FileLoader = (filePath: string) => {
    loadedFiles.push(filePath);
    return Promise.resolve({
      name: null, // composition-only mode
      description: `Agent from ${filePath}`,
    });
  };

  const loaderPlugin: ToolPlugin = {
    name: "agent-loader",
    configureServer: (server) => {
      server.registerFileLoader(".agent", agentLoader);
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    ["./test.agent", "./another.agent"],
    { plugins: [loaderPlugin] },
  );

  assertEquals(loadedFiles.length, 2);
  assertEquals(loadedFiles[0], "./test.agent");
  assertEquals(loadedFiles[1], "./another.agent");
});

Deno.test("FileLoader - throws error for unregistered extension", async () => {
  await assertRejects(
    async () => {
      await mcpc(
        [{ name: "test-server", version: "1.0.0" }, {}],
        ["./config.unknown"],
        {},
      );
    },
    Error,
    'No loader registered for ".unknown" extension',
  );
});

Deno.test("FileLoader - error message includes supported extensions", async () => {
  const loaderPlugin: ToolPlugin = {
    name: "supported-loader",
    configureServer: (server) => {
      server.registerFileLoader(".supported1", testLoader);
      server.registerFileLoader(".supported2", testLoader);
    },
  };

  await assertRejects(
    async () => {
      await mcpc(
        [{ name: "test-server", version: "1.0.0" }, {}],
        ["./config.nosupport"],
        { plugins: [loaderPlugin] },
      );
    },
    Error,
    "Supported extensions:",
  );
});

Deno.test("FileLoader - inline ComposeDefinition still works", async () => {
  const inlineConfig: ComposeDefinition = {
    name: null,
    description: "Inline agent definition",
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [inlineConfig],
    {},
  );

  assertEquals(typeof server.callTool, "function");
});

Deno.test("FileLoader - mixed inline and file-based inputs", async () => {
  const loadedFiles: string[] = [];
  const mixedLoader: FileLoader = (filePath: string) => {
    loadedFiles.push(filePath);
    return Promise.resolve({
      name: null,
      description: `From file: ${filePath}`,
    });
  };

  const loaderPlugin: ToolPlugin = {
    name: "mixed-loader",
    configureServer: (server) => {
      server.registerFileLoader(".mixed", mixedLoader);
    },
  };

  const inlineConfig: ComposeDefinition = {
    name: null,
    description: "Inline definition",
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [
      "./first.mixed",
      inlineConfig,
      "./second.mixed",
    ],
    { plugins: [loaderPlugin] },
  );

  assertEquals(loadedFiles.length, 2);
  assertEquals(loadedFiles[0], "./first.mixed");
  assertEquals(loadedFiles[1], "./second.mixed");
});

Deno.test("FileLoader - loader override (last registration wins)", async () => {
  const results: string[] = [];
  const loader1: FileLoader = () => {
    results.push("loader1");
    return Promise.resolve({ name: null, description: "" });
  };
  const loader2: FileLoader = () => {
    results.push("loader2");
    return Promise.resolve({ name: null, description: "" });
  };

  const loaderPlugin: ToolPlugin = {
    name: "override-loader",
    configureServer: (server) => {
      server.registerFileLoader(".override", loader1);
      server.registerFileLoader(".override", loader2);
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    ["./test.override"],
    { plugins: [loaderPlugin] },
  );

  assertEquals(results.length, 1);
  assertEquals(results[0], "loader2");
});

Deno.test("FileLoader - case insensitive extension matching", async () => {
  const loadedFiles: string[] = [];
  const caseLoader: FileLoader = (filePath: string) => {
    loadedFiles.push(filePath);
    return Promise.resolve({ name: null, description: "" });
  };

  const loaderPlugin: ToolPlugin = {
    name: "case-loader",
    configureServer: (server) => {
      server.registerFileLoader(".UPPER", caseLoader);
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    { plugins: [loaderPlugin] },
  );

  assertEquals(server.hasFileLoader(".upper"), true);
  assertEquals(server.hasFileLoader(".UPPER"), true);
});

Deno.test("FileLoader - server methods accessible", async () => {
  const loaderPlugin: ToolPlugin = {
    name: "methods-test",
    configureServer: (server) => {
      server.registerFileLoader(".test", testLoader);
    },
  };

  const server = await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [],
    { plugins: [loaderPlugin] },
  );

  assertEquals(server.hasFileLoader(".test"), true);
  assertEquals(server.hasFileLoader(".notregistered"), false);
  assertEquals(typeof server.getFileLoader(".test"), "function");
  assertEquals(server.getFileLoader(".notregistered"), undefined);
  assertEquals(server.getRegisteredExtensions().includes(".test"), true);
});

Deno.test("FileLoader - each server has isolated loaders", async () => {
  const loaderPlugin1: ToolPlugin = {
    name: "loader-1",
    configureServer: (server) => {
      server.registerFileLoader(".ext1", testLoader);
    },
  };

  const loaderPlugin2: ToolPlugin = {
    name: "loader-2",
    configureServer: (server) => {
      server.registerFileLoader(".ext2", testLoader);
    },
  };

  const server1 = await mcpc(
    [{ name: "server-1", version: "1.0.0" }, {}],
    [],
    { plugins: [loaderPlugin1] },
  );

  const server2 = await mcpc(
    [{ name: "server-2", version: "1.0.0" }, {}],
    [],
    { plugins: [loaderPlugin2] },
  );

  // Each server should only have its own loaders
  assertEquals(server1.hasFileLoader(".ext1"), true);
  assertEquals(server1.hasFileLoader(".ext2"), false);

  assertEquals(server2.hasFileLoader(".ext1"), false);
  assertEquals(server2.hasFileLoader(".ext2"), true);
});
