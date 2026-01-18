import { assertEquals, assertStringIncludes } from "@std/assert";
import { createSkillsPlugin } from "../../src/plugins/skills.ts";
import { mcpc } from "../../mod.ts";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ComposeDefinition } from "../../src/set-up-mcp-compose.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface ToolResult {
  content?: { type: string; text: string }[];
  isError?: boolean;
}

// Get the absolute path to the examples/skills directory
const testDir = dirname(fileURLToPath(import.meta.url));
const skillsPath = join(testDir, "../../examples/skills");

/** Create test server with skills plugin */
async function createTestServer() {
  const plugin = createSkillsPlugin({ paths: [skillsPath] });
  return await mcpc(
    [{ name: "skills-test", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [{
      name: "test-agent",
      description: "Test agent",
      plugins: [plugin],
    } as ComposeDefinition],
  );
}

Deno.test("skills plugin registers load-skill tool with skills list", async () => {
  const server = await createTestServer();

  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);

  const result = await client.listTools();
  const tool = result.tools.find((t) => t.name === "test-agent__load-skill");

  assertStringIncludes(tool?.description || "", "git-workflow");
  assertStringIncludes(tool?.description || "", "code-review");

  await client.close();
  await server.close();
});

Deno.test("load-skill returns skill body content", async () => {
  const server = await createTestServer();

  const result = (await server.callTool("test-agent__load-skill", {
    skill: "git-workflow",
  })) as ToolResult;

  const text = result?.content?.find((c) => c.type === "text")?.text || "";

  assertStringIncludes(text, "# Git Workflow");
  assertEquals(
    text.includes("---\nname:"),
    false,
    "Should not include frontmatter",
  );

  await server.close();
});

Deno.test("load-skill with ref returns reference file", async () => {
  const server = await createTestServer();

  const result = (await server.callTool("test-agent__load-skill", {
    skill: "git-workflow",
    ref: "references/hotfix.md",
  })) as ToolResult;

  const text = result?.content?.find((c) => c.type === "text")?.text || "";
  assertStringIncludes(text, "# Hotfix Procedure");

  await server.close();
});

Deno.test("load-skill rejects path traversal", async () => {
  const server = await createTestServer();

  const result = (await server.callTool("test-agent__load-skill", {
    skill: "git-workflow",
    ref: "../../../etc/passwd",
  })) as ToolResult;

  assertEquals(result.isError, true);
  assertStringIncludes(result?.content?.[0]?.text || "", "Invalid path");

  await server.close();
});

Deno.test("load-skill returns error for unknown skill", async () => {
  const server = await createTestServer();

  const result = (await server.callTool("test-agent__load-skill", {
    skill: "nonexistent",
  })) as ToolResult;

  assertEquals(result.isError, true);
  assertStringIncludes(result?.content?.[0]?.text || "", "not found");

  await server.close();
});
