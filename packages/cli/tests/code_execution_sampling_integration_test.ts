import { assertEquals, assertStringIncludes } from "@std/assert";
import { createServer } from "../src/app.ts";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

type MockSamplingResponse = {
  model: string;
  role: "assistant";
  content:
    | { type: "text"; text: string }
    | Array<{
      type: "tool_use";
      id: string;
      name: "submit_result";
      input: { text: string };
    }>;
  stopReason: "endTurn";
};

type SamplingEnabledServer = {
  callTool: (name: string, args: unknown) => Promise<ToolResult>;
  close: () => Promise<void>;
  sendLoggingMessage: (_message: unknown) => void;
  getClientCapabilities: () => { sampling: { tools: Record<string, never> } };
  createMessage: (_params: unknown) => Promise<MockSamplingResponse>;
};

const TEST_DIR = join(
  import.meta.dirname!,
  "fixtures",
  "code-execution-sampling-test",
);

async function setupMarkdownAgentFixture(): Promise<string> {
  await mkdir(TEST_DIR, { recursive: true });
  const filePath = join(TEST_DIR, "sampling-agent.md");
  const content = `---
name: markdown-sampling-agent
mode: code_execution_sampling
description: Markdown-loaded sampling agent
---

# Markdown Sampling Agent

This agent exercises the code execution sampling mode.`;

  await writeFile(filePath, content);
  return filePath;
}

async function cleanupFixtures() {
  await rm(TEST_DIR, { recursive: true, force: true });
}

function mockSampling(server: SamplingEnabledServer, responseText: string) {
  let createMessageCalls = 0;

  server.sendLoggingMessage = () => {};
  server.getClientCapabilities = () => ({ sampling: { tools: {} } });
  server.createMessage = (_params: unknown) => {
    createMessageCalls += 1;
    if (createMessageCalls === 1) {
      return Promise.resolve({
        model: "test-model",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "submit_result",
            input: { text: responseText },
          },
        ],
        stopReason: "endTurn",
      });
    }

    return Promise.resolve({
      model: "test-model",
      role: "assistant",
      content: { type: "text", text: "Done." },
      stopReason: "endTurn",
    });
  };
}

async function runSamplingCode(
  server: SamplingEnabledServer,
  toolName: string,
): Promise<ToolResult> {
  return await server.callTool(toolName, {
    tool: "exec",
    args: {
      code: `
        const { data, error } = await sampling(
          "Reply from sampling",
          { text: "string" }
        );
        console.log(JSON.stringify({ data, error }));
      `,
    },
  });
}

Deno.test({
  name:
    "CLI integration - markdown agent with code_execution_sampling mode works without explicit plugin paths",
  async fn() {
    const mdFilePath = await setupMarkdownAgentFixture();
    const server = await createServer({
      name: "test-server",
      version: "1.0.0",
      agents: [mdFilePath],
    });

    try {
      const samplingServer = server as unknown as SamplingEnabledServer;
      mockSampling(samplingServer, "hello from markdown sampling");
      const result = await runSamplingCode(
        samplingServer,
        "markdown-sampling-agent",
      );

      assertEquals(result.isError, undefined);
      assertStringIncludes(
        result.content.map((item) => item.text).join("\n"),
        '"text":"hello from markdown sampling"',
      );
    } finally {
      await server.close();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await cleanupFixtures();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name:
    "CLI integration - inline agent with code_execution_sampling mode works without explicit plugin wiring",
  async fn() {
    const server = await createServer({
      name: "test-server",
      version: "1.0.0",
      agents: [
        {
          name: "inline-sampling-agent",
          description: "Inline sampling agent",
          deps: { mcpServers: {} },
          options: { mode: "code_execution_sampling" },
        },
      ],
    });

    try {
      const samplingServer = server as unknown as SamplingEnabledServer;
      mockSampling(samplingServer, "hello from inline sampling");
      const result = await runSamplingCode(
        samplingServer,
        "inline-sampling-agent",
      );

      assertEquals(result.isError, undefined);
      assertStringIncludes(
        result.content.map((item) => item.text).join("\n"),
        '"text":"hello from inline sampling"',
      );
    } finally {
      await server.close();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
