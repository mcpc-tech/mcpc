import { assertEquals, assertExists } from "jsr:@std/assert";
import { loadConfig } from "../src/config/loader.ts";
import { createServer } from "../src/app.ts";
import process from "node:process";

Deno.test("Bug fix - empty deps object should work", async () => {
  // Setup - this was causing the error
  process.env.API_KEY = "secret123";
  process.env.MCPC_CONFIG = JSON.stringify([
    {
      name: "agent",
      description: "Key: $API_KEY",
      deps: {}, // Empty deps object
    },
  ]);

  // Test config loading
  const config = await loadConfig();
  assertExists(config);
  assertEquals(config.agents[0].description, "Key: secret123");
  
  // Verify deps.mcpServers was added
  assertExists(config.agents[0].deps);
  assertExists(config.agents[0].deps.mcpServers);
  assertEquals(typeof config.agents[0].deps.mcpServers, "object");

  // Test server creation should not throw
  const server = await createServer(config);
  assertExists(server);

  // Cleanup
  delete process.env.API_KEY;
  delete process.env.MCPC_CONFIG;
});
