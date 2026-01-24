/**
 * Integration test: CLI loads markdown agent files via MCP client
 */

import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client";
import { assertEquals, assertExists } from "@std/assert";
import { createServer } from "../src/app.ts";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";

const TEST_DIR = join(import.meta.dirname!, "fixtures", "md-loader-test");

async function setupTestFixtures() {
  await mkdir(TEST_DIR, { recursive: true });

  // Create a simple markdown agent file
  const agentMd = `---
name: test-md-agent
description: A test agent loaded from markdown
---

# Test Agent

This agent is loaded from a markdown file for testing purposes.
`;

  await writeFile(join(TEST_DIR, "test-agent.md"), agentMd);
}

async function cleanupTestFixtures() {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

Deno.test({
  name: "CLI loads markdown agent file via markdownLoaderPlugin",
  async fn() {
    await setupTestFixtures();

    try {
      const mdFilePath = join(TEST_DIR, "test-agent.md");

      // Create server with markdown file path
      const server = await createServer({
        name: "test-server",
        version: "1.0.0",
        agents: [mdFilePath],
      });

      const [clientTransport, serverTransport] = InMemoryTransport
        .createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      await client.connect(clientTransport);

      // List tools - should include the agent loaded from markdown
      const tools = await client.listTools();

      // Find the agent tool
      const agentTool = tools.tools.find((t) => t.name === "test-md-agent");
      assertExists(agentTool, "Agent tool from markdown file should exist");
      assertEquals(
        agentTool.description?.includes("A test agent loaded from markdown"),
        true,
        "Agent should have description from markdown frontmatter",
      );

      await client.close();
      await server.close();
    } finally {
      await cleanupTestFixtures();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "CLI loads multiple markdown agent files",
  async fn() {
    await setupTestFixtures();

    // Create second agent
    const agent2Md = `---
name: second-md-agent
description: Second test agent
---

# Second Agent

Another agent for testing.
`;
    await writeFile(join(TEST_DIR, "second-agent.md"), agent2Md);

    try {
      const server = await createServer({
        name: "test-server",
        version: "1.0.0",
        agents: [
          join(TEST_DIR, "test-agent.md"),
          join(TEST_DIR, "second-agent.md"),
        ],
      });

      const [clientTransport, serverTransport] = InMemoryTransport
        .createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      await client.connect(clientTransport);

      const tools = await client.listTools();

      // Should have both agents
      const agent1 = tools.tools.find((t) => t.name === "test-md-agent");
      const agent2 = tools.tools.find((t) => t.name === "second-md-agent");

      assertExists(agent1, "First agent should exist");
      assertExists(agent2, "Second agent should exist");

      await client.close();
      await server.close();
    } finally {
      await cleanupTestFixtures();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "CLI loads mixed inline and markdown agents",
  async fn() {
    await setupTestFixtures();

    try {
      const server = await createServer({
        name: "test-server",
        version: "1.0.0",
        agents: [
          // Inline agent
          {
            name: "inline-agent",
            description: "An inline defined agent",
          },
          // Markdown file agent
          join(TEST_DIR, "test-agent.md"),
        ],
      });

      const [clientTransport, serverTransport] = InMemoryTransport
        .createLinkedPair();
      await server.connect(serverTransport);

      const client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      await client.connect(clientTransport);

      const tools = await client.listTools();

      const inlineAgent = tools.tools.find((t) => t.name === "inline-agent");
      const mdAgent = tools.tools.find((t) => t.name === "test-md-agent");

      assertExists(inlineAgent, "Inline agent should exist");
      assertExists(mdAgent, "Markdown agent should exist");

      await client.close();
      await server.close();
    } finally {
      await cleanupTestFixtures();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
