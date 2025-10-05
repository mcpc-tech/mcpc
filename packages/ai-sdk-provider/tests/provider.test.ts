/**
 * Tests for MCP AI SDK Provider
 */

import { createMCPProvider, MCPProvider } from "../mod.ts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Simple assertions
function assertEquals<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected} but got ${actual}`);
  }
}

function assertExists<T>(value: T, msg?: string) {
  if (value === null || value === undefined) {
    throw new Error(msg || `Expected value to exist`);
  }
}

// Mock MCP Client for testing
class MockMCPClient {
  request(
    params: { method: string; params: unknown },
    _schema: unknown,
  ) {
    if (params.method === "sampling/createMessage") {
      // Return a mock response
      return Promise.resolve({
        role: "assistant",
        content: {
          type: "text",
          text: "Test response",
        },
        model: "test-model",
        stopReason: "endTurn",
      });
    }
    throw new Error("Unsupported method");
  }
}

Deno.test("createMCPProvider - creates provider instance", () => {
  const mockClient = new MockMCPClient() as unknown as Client;

  const provider = createMCPProvider({
    client: mockClient,
  });

  assertExists(provider);
  assertEquals(provider instanceof MCPProvider, true);
});

Deno.test("MCPProvider - creates language model", () => {
  const mockClient = new MockMCPClient() as unknown as Client;

  const provider = createMCPProvider({
    client: mockClient,
  });

  const model = provider.languageModel("test-model");

  assertExists(model);
  assertEquals(model.modelId, "test-model");
  assertEquals(model.provider, "mcp");
  assertEquals(model.specificationVersion, "v1");
});

Deno.test("MCPLanguageModel - doGenerate generates text", async () => {
  const mockClient = new MockMCPClient() as unknown as Client;

  const provider = createMCPProvider({
    client: mockClient,
  });

  const model = provider.languageModel("test-model");

  const result = await model.doGenerate({
    inputFormat: "prompt",
    mode: {
      type: "regular",
    },
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello",
          },
        ],
      },
    ],
  });

  assertExists(result);
  assertEquals(result.text, "Test response");
  assertEquals(result.finishReason, "stop");
  assertExists(result.usage);
});

Deno.test("MCPLanguageModel - doStream generates stream", async () => {
  const mockClient = new MockMCPClient() as unknown as Client;

  const provider = createMCPProvider({
    client: mockClient,
  });

  const model = provider.languageModel("test-model");

  const result = await model.doStream({
    inputFormat: "prompt",
    mode: {
      type: "regular",
    },
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello",
          },
        ],
      },
    ],
  });

  assertExists(result);
  assertExists(result.stream);

  // Read stream
  const reader = result.stream.getReader();
  const chunks: unknown[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Should have text-delta and finish chunks
  assertEquals(chunks.length >= 2, true);
});

Deno.test("MCPProvider - call method works as shorthand", () => {
  const mockClient = new MockMCPClient() as unknown as Client;

  const provider = createMCPProvider({
    client: mockClient,
  });

  const model = provider.call("test-model");

  assertExists(model);
  assertEquals(model.modelId, "test-model");
});
