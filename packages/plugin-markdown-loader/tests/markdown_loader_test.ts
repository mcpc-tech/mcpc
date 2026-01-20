import { assertEquals, assertThrows } from "@std/assert";
import {
  markdownAgentToComposeDefinition,
  parseMarkdownAgent,
} from "../src/markdown-loader.ts";

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
  assertEquals(parsed.description.includes("# Test Agent"), true);
  assertEquals(
    parsed.description.includes('<tool name="desktop-commander.read_file"/>'),
    true,
  );
});

Deno.test("parse minimal markdown agent file", () => {
  const parsed = parseMarkdownAgent(fixtures.minimal);
  assertEquals(parsed.frontMatter.name, "simple-agent");
  assertEquals(parsed.frontMatter.mode, undefined);
  assertEquals(parsed.frontMatter.deps, undefined);
  assertEquals(parsed.description, "Simple description.");
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
