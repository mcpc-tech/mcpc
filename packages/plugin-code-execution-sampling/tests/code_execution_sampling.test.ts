import { assertEquals, assertStringIncludes } from "@std/assert";
import { mcpc } from "@mcpc/core";
import { createCodeExecutionSamplingPlugin } from "../mod.ts";

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
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
      input: Record<string, unknown>;
    }>;
  stopReason: "endTurn";
};

type SamplingTestServer = {
  callTool: (name: string, args: unknown) => Promise<ToolResult>;
  close?: () => Promise<void>;
  sendLoggingMessage: (_message: unknown) => void;
  getClientCapabilities: () => { sampling: Record<string, unknown> };
  createMessage: (
    _params: unknown,
  ) => MockSamplingResponse | Promise<MockSamplingResponse>;
};

function getCombinedText(result: ToolResult): string {
  return result.content.map((item) => item.text).join("\n");
}

Deno.test(
  "Code execution sampling plugin - sampling(prompt, outputSchema) returns { data, error }",
  async () => {
    const server = await mcpc(
      [
        { name: "test-code-exec-sampling", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "test-agent",
          description: "Test agent",
          deps: { mcpServers: {} },
          plugins: [createCodeExecutionSamplingPlugin()],
          options: {
            mode: "code_execution_sampling",
          },
        },
      ],
    );

    try {
      let createMessageCalls = 0;
      const serverWithSampling = server as unknown as SamplingTestServer;

      serverWithSampling.sendLoggingMessage = () => {};
      serverWithSampling.getClientCapabilities = () => ({
        sampling: { tools: {} },
      });
      serverWithSampling.createMessage = (_params: unknown) => {
        createMessageCalls += 1;
        if (createMessageCalls === 1) {
          return {
            model: "test-model",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "call_1",
                name: "submit_result",
                input: { name: "Alice", age: 30 },
              },
            ],
            stopReason: "endTurn",
          };
        }

        return {
          model: "test-model",
          role: "assistant",
          content: { type: "text", text: "Done." },
          stopReason: "endTurn",
        };
      };

      const result = await serverWithSampling.callTool("test-agent", {
        tool: "exec",
        args: {
          code: `
            const { data, error } = await sampling(
              "Extract user info",
              { name: "string", age: "number" }
            );
            console.log(JSON.stringify({ data, error }));
          `,
        },
      });

      assertEquals(result.isError, undefined);
      const combinedText = getCombinedText(result);
      assertStringIncludes(combinedText, '"name":"Alice"');
      assertStringIncludes(combinedText, '"age":30');
    } finally {
      await server.close?.();
      await new Promise((r) => setTimeout(r, 1000));
    }
  },
);

Deno.test(
  "Code execution sampling plugin - sampling() without outputSchema returns error",
  async () => {
    const server = await mcpc(
      [
        { name: "test-code-exec-sampling", version: "1.0.0" },
        {
          capabilities: { tools: {} },
        },
      ],
      [
        {
          name: "test-agent",
          description: "Test agent",
          deps: { mcpServers: {} },
          plugins: [createCodeExecutionSamplingPlugin()],
          options: {
            mode: "code_execution_sampling",
          },
        },
      ],
    );

    try {
      const serverWithSampling = server as unknown as SamplingTestServer;
      serverWithSampling.sendLoggingMessage = () => {};
      serverWithSampling.getClientCapabilities = () => ({ sampling: {} });
      serverWithSampling.createMessage = () => {
        return {
          model: "test-model",
          role: "assistant",
          content: { type: "text", text: "unused" },
          stopReason: "endTurn",
        };
      };

      const result = await serverWithSampling.callTool("test-agent", {
        tool: "exec",
        args: {
          code: `
            const { data, error } = await sampling("hello");
            console.log(JSON.stringify({ data, error }));
          `,
        },
      });

      assertEquals(result.isError, undefined);
      const combinedText = getCombinedText(result);
      assertStringIncludes(combinedText, '"error"');
      assertStringIncludes(combinedText, "outputSchema");
    } finally {
      await server.close?.();
      await new Promise((r) => setTimeout(r, 1000));
    }
  },
);
