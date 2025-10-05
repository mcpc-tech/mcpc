/**
 * Tests for MCP AI SDK Provider (LanguageModelV2)
 */

import { assertEquals, assertExists } from "@std/assert";
import { createMCPSamplingProvider, MCPProvider } from "../mod.ts";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

// Mock MCP Server for testing
class MockMCPServer extends Server {
  constructor() {
    super(
      {
        name: "test-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          sampling: {},
        },
      },
    );
  }

  // Mock createMessage implementation
  override createMessage(params: {
    [x: string]: unknown;
    messages: Array<{
      [x: string]: unknown;
      role: "user" | "assistant";
      content: unknown;
    }>;
    systemPrompt?: string;
    maxTokens?: number;
  }) {
    const lastMessage = params.messages[params.messages.length - 1];
    const content = lastMessage?.content as { type: "text"; text: string };
    const userText = content?.text || "Hello";

    return Promise.resolve({
      role: "assistant" as const,
      content: {
        type: "text" as const,
        text: `Echo: ${userText}`,
      },
      model: "test-model",
      stopReason: "endTurn" as const,
    });
  }
}

Deno.test("createMCPProvider - creates provider instance", () => {
  const mockServer = new MockMCPServer();

  const provider = createMCPSamplingProvider({
    server: mockServer,
  });

  assertExists(provider);
  assertEquals(provider instanceof MCPProvider, true);
});

Deno.test("MCPProvider - creates language model", () => {
  const mockServer = new MockMCPServer();

  const provider = createMCPSamplingProvider({
    server: mockServer,
  });

  const model = provider.languageModel("test-model");

  assertExists(model);
  assertEquals(model.modelId, "test-model");
  assertEquals(model.provider, "mcp");
  assertEquals(model.specificationVersion, "v2");
});
