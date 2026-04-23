import { assertEquals, assertStringIncludes } from "@std/assert";
import { createSkillsPlugin } from "../../src/plugins/skills.ts";
import { mcpc } from "../../mod.ts";
import type { ComposeDefinition } from "../../src/set-up-mcp-compose.ts";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface ToolResult {
  content?: { type: string; text: string }[];
  isError?: boolean;
}

// Get the absolute path to the .agents/skills directory at project root
const testDir = dirname(fileURLToPath(import.meta.url));
const skillsPath = join(testDir, "../../../../.agents/skills");

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

  // Test that the tool exists and works by calling it
  // Internal tools are not visible via client.listTools() but can be called
  const result = (await server.callTool("test-agent__load-skill", {
    skill: "creating-slidev-presentations",
  })) as ToolResult;

  // Verify tool works and contains skill content
  const text = result?.content?.find((c) => c.type === "text")?.text || "";
  assertStringIncludes(text, "# Creating Slidev Presentations");

  await server.close();
});

Deno.test("load-skill returns skill body content", async () => {
  const server = await createTestServer();

  const result = (await server.callTool("test-agent__load-skill", {
    skill: "creating-slidev-presentations",
  })) as ToolResult;

  const text = result?.content?.find((c) => c.type === "text")?.text || "";

  assertStringIncludes(text, "# Creating Slidev Presentations");
  assertEquals(
    text.includes("---\nname:"),
    false,
    "Should not include frontmatter",
  );

  await server.close();
});

Deno.test("load-skill with ref returns reference file", async () => {
  const server = await createTestServer();

  // creating-slidev-presentations doesn't have references/ so this should error
  const result = (await server.callTool("test-agent__load-skill", {
    skill: "creating-slidev-presentations",
    ref: "references/nonexistent.md",
  })) as ToolResult;

  assertEquals(result.isError, true);

  await server.close();
});

Deno.test("load-skill rejects path traversal", async () => {
  const server = await createTestServer();

  const result = (await server.callTool("test-agent__load-skill", {
    skill: "creating-slidev-presentations",
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
