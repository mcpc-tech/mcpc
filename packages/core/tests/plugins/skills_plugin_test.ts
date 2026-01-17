import { assertEquals, assertStringIncludes } from "@std/assert";
import { createSkillsPlugin } from "../../src/plugins/skills.ts";
import { mcpc } from "../../mod.ts";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ComposeDefinition } from "../../src/set-up-mcp-compose.ts";

interface ToolResult {
  content?: { type: string; text: string }[];
  isError?: boolean;
}

Deno.test("skills plugin registers load-skill tool with skills list", async () => {
  const plugin = createSkillsPlugin({
    paths: ["./examples/skills"],
  });

  const server = await mcpc(
    [{ name: "skills-test", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [
      {
        name: "test-agent",
        description: "Test agent",
        plugins: [plugin],
      } as ComposeDefinition,
    ],
  );

  // Connect via in-memory transport
  const [clientTransport, serverTransport] = InMemoryTransport
    .createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);

  // Get tool list via MCP protocol
  const result = await client.listTools();
  const loadSkillTool = result.tools.find((t) =>
    t.name === "test-agent__load-skill"
  );

  // Check load-skill tool description includes skills list
  assertStringIncludes(
    loadSkillTool?.description || "",
    "Available skills:",
    "Should list available skills",
  );
  assertStringIncludes(
    loadSkillTool?.description || "",
    "git-workflow",
    "Should include git-workflow skill",
  );
  assertStringIncludes(
    loadSkillTool?.description || "",
    "code-review",
    "Should include code-review skill",
  );

  await client.close();
  await server.close();
});

Deno.test("load-skill returns skill body content", async () => {
  const plugin = createSkillsPlugin({
    paths: ["./examples/skills"],
  });

  const server = await mcpc(
    [{ name: "skills-test", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [
      {
        name: "test-agent",
        description: "Test agent",
        plugins: [plugin],
      } as ComposeDefinition,
    ],
  );

  // Call load-skill tool
  const result = (await server.callTool("test-agent__load-skill", {
    skill: "git-workflow",
  })) as ToolResult;

  const text = result?.content?.find((c) => c.type === "text")?.text || "";

  // Should return body without frontmatter
  assertStringIncludes(text, "# Git Workflow", "Should include skill content");
  assertStringIncludes(
    text,
    "Branch Naming Convention",
    "Should include body content",
  );

  // Should NOT include frontmatter
  assertEquals(
    text.includes("---\nname:"),
    false,
    "Should not include frontmatter",
  );

  await server.close();
});

Deno.test("load-skill with ref returns reference file", async () => {
  const plugin = createSkillsPlugin({
    paths: ["./examples/skills"],
  });

  const server = await mcpc(
    [{ name: "skills-test", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [
      {
        name: "test-agent",
        description: "Test agent",
        plugins: [plugin],
      } as ComposeDefinition,
    ],
  );

  // Call load-skill with ref
  const result = (await server.callTool("test-agent__load-skill", {
    skill: "git-workflow",
    ref: "references/hotfix.md",
  })) as ToolResult;

  const text = result?.content?.find((c) => c.type === "text")?.text || "";

  assertStringIncludes(
    text,
    "# Hotfix Procedure",
    "Should return hotfix.md content",
  );
  assertStringIncludes(
    text,
    "Critical production bugs",
    "Should include hotfix details",
  );

  await server.close();
});

Deno.test("load-skill rejects path traversal", async () => {
  const plugin = createSkillsPlugin({
    paths: ["./examples/skills"],
  });

  const server = await mcpc(
    [{ name: "skills-test", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [
      {
        name: "test-agent",
        description: "Test agent",
        plugins: [plugin],
      } as ComposeDefinition,
    ],
  );

  // Try path traversal
  const result = (await server.callTool("test-agent__load-skill", {
    skill: "git-workflow",
    ref: "../../../etc/passwd",
  })) as ToolResult;

  assertEquals(result.isError, true, "Should reject path traversal");
  assertStringIncludes(
    result?.content?.find((c) => c.type === "text")?.text || "",
    "Invalid ref path",
    "Should return error message",
  );

  await server.close();
});

Deno.test("load-skill returns error for unknown skill", async () => {
  const plugin = createSkillsPlugin({
    paths: ["./examples/skills"],
  });

  const server = await mcpc(
    [{ name: "skills-test", version: "1.0.0" }, {
      capabilities: { tools: {} },
    }],
    [
      {
        name: "test-agent",
        description: "Test agent",
        plugins: [plugin],
      } as ComposeDefinition,
    ],
  );

  const result = (await server.callTool("test-agent__load-skill", {
    skill: "nonexistent",
  })) as ToolResult;

  assertEquals(result.isError, true, "Should return error for unknown skill");
  assertStringIncludes(
    result?.content?.find((c) => c.type === "text")?.text || "",
    "not found",
    "Should indicate skill not found",
  );

  await server.close();
});
