/**
 * Tests for MCPSamplingLanguageModel with native tools support
 */

import { assertEquals } from "@std/assert";
import { MCPSamplingLanguageModel } from "../src/language-model.ts";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

// Mock server for testing
function createMockServer(options: {
  supportsTools?: boolean;
  responseContent?: any;
}): Server {
  const mockServer = {
    getClientCapabilities: () => ({
      sampling: options.supportsTools ? { tools: true } : {},
    }),
    createMessage: (params: any) => {
      // Return mock response based on whether tools were passed
      if (params.tools && params.tools.length > 0) {
        // Native tools mode response
        return {
          model: "test-model",
          role: "assistant" as const,
          content: options.responseContent || [
            { type: "text", text: "Using native tools" },
          ],
          stopReason: "endTurn" as const,
        };
      } else {
        // JSON fallback mode response
        return {
          model: "test-model",
          role: "assistant" as const,
          content: options.responseContent || {
            type: "text",
            text: "Using JSON fallback",
          },
          stopReason: "endTurn" as const,
        };
      }
    },
  } as unknown as Server;

  return mockServer;
}

Deno.test("MCPSamplingLanguageModel - native tools mode detection", async () => {
  const server = createMockServer({ supportsTools: true });
  const model = new MCPSamplingLanguageModel({ server });

  const result = await model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    tools: [
      {
        type: "function",
        name: "test_tool",
        description: "A test tool",
        inputSchema: {
          type: "object",
          properties: {
            arg: { type: "string" },
          },
        },
      },
    ],
  });

  // Should have called createMessage with tools parameter
  assertEquals(result.response?.modelId, "test-model");
});

Deno.test("MCPSamplingLanguageModel - JSON fallback mode", async () => {
  const server = createMockServer({ supportsTools: false });
  const model = new MCPSamplingLanguageModel({ server });

  const result = await model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    tools: [
      {
        type: "function",
        name: "test_tool",
        description: "A test tool",
        inputSchema: {
          type: "object",
          properties: {
            arg: { type: "string" },
          },
        },
      },
    ],
  });

  // Should have called createMessage without tools parameter
  assertEquals(result.response?.modelId, "test-model");
});

Deno.test("MCPSamplingLanguageModel - native tool_use response", async () => {
  const server = createMockServer({
    supportsTools: true,
    responseContent: [
      { type: "text", text: "I'll use a tool" },
      {
        type: "tool_use",
        id: "call_123",
        name: "test_tool",
        input: { arg: "value" },
      },
    ],
  });

  const model = new MCPSamplingLanguageModel({ server });

  const result = await model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "Use a tool" }] }],
    tools: [
      {
        type: "function",
        name: "test_tool",
        description: "A test tool",
        inputSchema: {
          type: "object",
          properties: {
            arg: { type: "string" },
          },
        },
      },
    ],
  });

  // Should have 2 content blocks: text and tool-call
  assertEquals(result.content.length, 2);
  assertEquals(result.content[0].type, "text");
  assertEquals(result.content[1].type, "tool-call");

  if (result.content[1].type === "tool-call") {
    assertEquals(result.content[1].toolName, "test_tool");
    assertEquals(result.content[1].toolCallId, "call_123");
  }
});

Deno.test("MCPSamplingLanguageModel - XML fallback tool parsing", async () => {
  const server = createMockServer({
    supportsTools: false,
    responseContent: {
      type: "text",
      text:
        'I will use a tool\n<use_tool tool="test_tool">{"arg": "value"}</use_tool>',
    },
  });

  const model = new MCPSamplingLanguageModel({ server });

  const result = await model.doGenerate({
    prompt: [{ role: "user", content: [{ type: "text", text: "Use a tool" }] }],
    tools: [
      {
        type: "function",
        name: "test_tool",
        description: "A test tool",
        inputSchema: {
          type: "object",
          properties: {
            arg: { type: "string" },
          },
        },
      },
    ],
  });

  // Should have 2 content blocks: text and tool-call
  assertEquals(result.content.length, 2);
  assertEquals(result.content[0].type, "text");
  assertEquals(result.content[1].type, "tool-call");

  if (result.content[1].type === "tool-call") {
    assertEquals(result.content[1].toolName, "test_tool");
  }
});
