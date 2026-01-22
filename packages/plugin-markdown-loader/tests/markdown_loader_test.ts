import { assertEquals, assertThrows } from "@std/assert";
import {
  isDirectory,
  loadMarkdownAgentDirectory,
  markdownAgentToComposeDefinition,
  parseMarkdownAgent,
} from "../src/markdown-loader.ts";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Test fixtures
const fixtures = {
  valid: `---
name: test-agent
mode: agentic
maxSteps: 100
deps:
  mcpServers:
    desktop-commander:
      command: npx
      args: ["-y", "@wonderwhy-er/desktop-commander"]
      transportType: stdio
---

# Test Agent

This is a test agent description.

Available tools:
<tool name="desktop-commander.read_file"/>
`,
  minimal: `---
name: simple-agent
---

Simple description.
`,
  noFrontMatter: `# No Front Matter

This file has no YAML front matter.
`,
  noName: `---
mode: agentic
---

No name specified.
`,
  full: `---
name: test-agent
mode: ai_sampling
maxSteps: 50
maxTokens: 128000
tracingEnabled: true
plugins:
  - ./plugins/custom.ts
refs:
  - '<tool name="server.__ALL__"/>'
deps:
  mcpServers:
    server:
      command: npx
      args: ["-y", "some-mcp-server"]
      transportType: stdio
samplingConfig:
  maxIterations: 10
providerOptions:
  modelPreferences:
    hints:
      - name: claude-3-5-sonnet
---

# Test Agent

Description here.
`,
  envVar: `---
name: env-agent
deps:
  mcpServers:
    github:
      transportType: streamable-http
      url: https://api.githubcopilot.com/mcp/
      headers:
        Authorization: Bearer $GITHUB_TOKEN
---

Agent with env var.
`,
  withDescription: `---
name: manual-agent
description: A short description for the agent.
mode: agentic
---

# Detailed Manual

This is the detailed manual content.
It will be used as the \`manual\` field for progressive disclosure.

## Usage

Use <tool name="server.tool"/> to do something.
`,
};

Deno.test("parse valid markdown agent file", () => {
  const parsed = parseMarkdownAgent(fixtures.valid);
  assertEquals(parsed.frontMatter.name, "test-agent");
  assertEquals(parsed.frontMatter.mode, "agentic");
  assertEquals(parsed.frontMatter.maxSteps, 100);
  const dcServer = parsed.frontMatter.deps?.mcpServers["desktop-commander"] as {
    command?: string;
  };
  assertEquals(dcServer?.command, "npx");
  assertEquals(parsed.body.includes("# Test Agent"), true);
  assertEquals(
    parsed.body.includes('<tool name="desktop-commander.read_file"/>'),
    true,
  );
});

Deno.test("parse minimal markdown agent file", () => {
  const parsed = parseMarkdownAgent(fixtures.minimal);
  assertEquals(parsed.frontMatter.name, "simple-agent");
  assertEquals(parsed.frontMatter.mode, undefined);
  assertEquals(parsed.frontMatter.deps, undefined);
  assertEquals(parsed.body, "Simple description.");
});

Deno.test("throw error for missing front matter", () => {
  assertThrows(
    () => parseMarkdownAgent(fixtures.noFrontMatter),
    Error,
    "missing YAML front matter",
  );
});

Deno.test("throw error for missing name", () => {
  assertThrows(
    () => parseMarkdownAgent(fixtures.noName),
    Error,
    "'name' is required",
  );
});

Deno.test("convert to ComposeDefinition", () => {
  const parsed = parseMarkdownAgent(fixtures.full);
  const definition = markdownAgentToComposeDefinition(parsed);

  assertEquals(definition.name, "test-agent");
  assertEquals(definition.description, "# Test Agent\n\nDescription here.");
  assertEquals(definition.options?.mode, "ai_sampling");
  assertEquals(definition.options?.maxSteps, 50);
  assertEquals(definition.options?.maxTokens, 128000);
  assertEquals(definition.options?.tracingEnabled, true);
  assertEquals(definition.plugins, ["./plugins/custom.ts"]);
  assertEquals(definition.options?.refs, ['<tool name="server.__ALL__"/>']);
  assertEquals(definition.options?.samplingConfig?.maxIterations, 10);
  assertEquals(
    definition.options?.providerOptions?.modelPreferences?.hints?.[0].name,
    "claude-3-5-sonnet",
  );
});

Deno.test("empty options removed", () => {
  const parsed = parseMarkdownAgent(fixtures.minimal);
  const definition = markdownAgentToComposeDefinition(parsed);
  assertEquals(definition.name, "simple-agent");
  assertEquals(definition.options, undefined);
});

Deno.test("environment variable in deps", () => {
  const parsed = parseMarkdownAgent(fixtures.envVar);
  const ghServer = parsed.frontMatter.deps?.mcpServers["github"] as {
    headers?: Record<string, string>;
  };
  assertEquals(ghServer?.headers?.["Authorization"], "Bearer $GITHUB_TOKEN");
});

Deno.test("frontmatter description becomes description, body becomes manual", () => {
  const parsed = parseMarkdownAgent(fixtures.withDescription);
  assertEquals(parsed.frontMatter.name, "manual-agent");
  assertEquals(
    parsed.frontMatter.description,
    "A short description for the agent.",
  );
  assertEquals(parsed.body.includes("# Detailed Manual"), true);

  const definition = markdownAgentToComposeDefinition(parsed);
  assertEquals(definition.name, "manual-agent");
  assertEquals(definition.description, "A short description for the agent.");
  assertEquals(definition.manual?.includes("# Detailed Manual"), true);
  assertEquals(definition.manual?.includes('<tool name="server.tool"/>'), true);
});

Deno.test("without frontmatter description, body becomes description (no manual)", () => {
  const parsed = parseMarkdownAgent(fixtures.minimal);
  const definition = markdownAgentToComposeDefinition(parsed);
  assertEquals(definition.name, "simple-agent");
  assertEquals(definition.description, "Simple description.");
  assertEquals(definition.manual, undefined);
});

// Directory loading tests
const TEST_DIR = "./test-agents-temp";

Deno.test("loadMarkdownAgentDirectory loads all markdown files", async () => {
  // Setup test directory
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(
    join(TEST_DIR, "agent1.md"),
    `---
name: agent-one
---

Agent one description.
`,
  );
  await writeFile(
    join(TEST_DIR, "agent2.md"),
    `---
name: agent-two
mode: agentic
---

Agent two description.
`,
  );
  // Non-markdown file should be ignored
  await writeFile(join(TEST_DIR, "readme.txt"), "This is not an agent.");

  try {
    const definitions = await loadMarkdownAgentDirectory(TEST_DIR);
    assertEquals(definitions.length, 2);
    const names = definitions.map((d) => d.name).sort();
    assertEquals(names, ["agent-one", "agent-two"]);
  } finally {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
});

Deno.test("loadMarkdownAgentDirectory with recursive option", async () => {
  // Setup test directory with subdirectory
  await mkdir(join(TEST_DIR, "subdir"), { recursive: true });
  await writeFile(
    join(TEST_DIR, "root-agent.md"),
    `---
name: root-agent
---

Root agent.
`,
  );
  await writeFile(
    join(TEST_DIR, "subdir", "nested-agent.md"),
    `---
name: nested-agent
---

Nested agent.
`,
  );

  try {
    // Non-recursive should only find root
    const nonRecursive = await loadMarkdownAgentDirectory(TEST_DIR);
    assertEquals(nonRecursive.length, 1);
    assertEquals(nonRecursive[0].name, "root-agent");

    // Recursive should find both
    const recursive = await loadMarkdownAgentDirectory(TEST_DIR, {
      recursive: true,
    });
    assertEquals(recursive.length, 2);
    const names = recursive.map((d) => d.name).sort();
    assertEquals(names, ["nested-agent", "root-agent"]);
  } finally {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
});

Deno.test("isDirectory correctly identifies directories", async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(join(TEST_DIR, "file.txt"), "content");

  try {
    assertEquals(await isDirectory(TEST_DIR), true);
    assertEquals(await isDirectory(join(TEST_DIR, "file.txt")), false);
    assertEquals(await isDirectory("./non-existent-path"), false);
  } finally {
    await rm(TEST_DIR, { recursive: true, force: true });
  }
});
