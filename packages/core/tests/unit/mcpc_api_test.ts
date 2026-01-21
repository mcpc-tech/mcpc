/**
 * Tests for the new mcpc API (single configuration object pattern)
 */
import { assertEquals, assertExists } from "@std/assert";
import { type AgentDef, mcpc } from "../../mod.ts";

Deno.test("mcpc API - minimal config with defaults", async () => {
  const server = await mcpc({
    name: "test-server",
  });

  assertExists(server);
});

Deno.test("mcpc API - single agent with 'agent' field", async () => {
  const server = await mcpc({
    name: "test-server",
    agent: {
      name: "test-agent",
      description: "A test agent",
    },
  });

  assertExists(server);
  const tools = server.getPublicTools();
  assertEquals(tools.length, 1);
  assertEquals(tools[0].name, "test-agent");
});

Deno.test("mcpc API - multiple agents with 'agents' field", async () => {
  const server = await mcpc({
    name: "test-server",
    agents: [
      { name: "agent-1", description: "First agent" },
      { name: "agent-2", description: "Second agent" },
    ],
  });

  assertExists(server);
  const tools = server.getPublicTools();
  assertEquals(tools.length, 2);
});

Deno.test("mcpc API - agent + agents combined", async () => {
  const server = await mcpc({
    name: "test-server",
    agent: { name: "main-agent", description: "Main" },
    agents: [
      { name: "helper-1", description: "Helper 1" },
      { name: "helper-2", description: "Helper 2" },
    ],
  });

  assertExists(server);
  const tools = server.getPublicTools();
  assertEquals(tools.length, 3);
  // agent comes first
  assertEquals(tools[0].name, "main-agent");
});

Deno.test("mcpc API - composition-only mode (name: null)", async () => {
  const server = await mcpc({
    name: "test-server",
    agent: {
      name: null,
      description: "Composition only, no tool created",
    },
  });

  assertExists(server);
  const tools = server.getPublicTools();
  assertEquals(tools.length, 0);
});

Deno.test("mcpc API - global plugins applied to all agents", async () => {
  const pluginCalls: string[] = [];

  const server = await mcpc({
    name: "test-server",
    plugins: [
      {
        name: "test-plugin",
        beforeToolExecute: (ctx) => {
          pluginCalls.push(`before:${ctx.toolName}`);
          return undefined;
        },
      },
    ],
    agents: [
      { name: "agent-1", description: "First" },
      { name: "agent-2", description: "Second" },
    ],
  });

  assertExists(server);
  // Plugin should be registered (actual execution tested elsewhere)
});

Deno.test("mcpc API - agent with mode", async () => {
  const server = await mcpc({
    name: "test-server",
    agent: {
      name: "agentic-tool",
      description: "An agentic tool",
      mode: "agentic",
    },
  });

  assertExists(server);
});

Deno.test("mcpc API - agent with advanced options", async () => {
  const server = await mcpc({
    name: "test-server",
    agent: {
      name: "sampling-agent",
      description: "A sampling agent",
      mode: "ai_sampling",
      options: {
        maxSteps: 30,
        maxTokens: 64000,
        tracingEnabled: true,
      },
    },
  });

  assertExists(server);
});

Deno.test("mcpc API - setup callback", async () => {
  let setupCalled = false;

  const server = await mcpc({
    name: "test-server",
    setup: (_s) => {
      setupCalled = true;
      // Can add custom tools here
    },
  });

  assertExists(server);
  assertEquals(setupCalled, true);
});

Deno.test("mcpc API - AgentDef type export works", () => {
  // Type check - should compile
  const agent: AgentDef = {
    name: "typed-agent",
    description: "A typed agent",
    mcpServers: {
      "test-server": {
        command: "echo",
        args: ["hello"],
      },
    },
    mode: "agentic",
    plugins: [],
    options: {
      maxSteps: 10,
    },
  };

  assertExists(agent);
  assertEquals(agent.name, "typed-agent");
});
