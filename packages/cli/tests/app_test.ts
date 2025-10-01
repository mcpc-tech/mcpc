import { assertExists } from "jsr:@std/assert";
import { createServer } from "../src/app.ts";
import type { MCPCConfig } from "../src/config/loader.ts";

Deno.test("App - createServer with config", async () => {
  // Setup
  const config: MCPCConfig = {
    name: "test-server",
    version: "1.0.0",
    agents: [
      {
        name: null, // No composed tool
        description: "Test agent",
        plugins: [],
      },
    ],
  };

  // Test
  const server = await createServer(config);

  // Verify
  assertExists(server);
});

Deno.test("App - createServer without config uses defaults", async () => {
  // Test - no config provided
  const server = await createServer();

  // Verify
  assertExists(server);
});

Deno.test("App - createServer with custom capabilities", async () => {
  // Setup
  const config: MCPCConfig = {
    name: "custom-server",
    version: "2.0.0",
    capabilities: {
      tools: { listChanged: true },
      sampling: {},
    },
    agents: [
      {
        name: null,
        description: "Test",
        plugins: [],
      },
    ],
  };

  // Test
  const server = await createServer(config);

  // Verify
  assertExists(server);
});
