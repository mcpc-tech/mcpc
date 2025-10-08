/**
 * Tests for setupClientSampling
 */

import { assertEquals } from "@std/assert";
import { setupClientSampling } from "../src/client-sampling.ts";
import type { CreateMessageRequest } from "@modelcontextprotocol/sdk/types.js";

Deno.test("setupClientSampling - configures client with handler", async () => {
  // Mock client with setRequestHandler method
  let registeredHandler: any = null;
  const mockClient = {
    setRequestHandler: (_schema: any, handler: any) => {
      registeredHandler = handler;
    },
  };

  setupClientSampling(mockClient as any, {
    handler: (_params) => {
      return Promise.resolve({
        model: "test-model",
        role: "assistant" as const,
        content: { type: "text" as const, text: "Test response" },
        stopReason: "endTurn" as const,
      });
    },
  });

  // Verify handler was registered
  assertEquals(typeof registeredHandler, "function");

  // Test the registered handler
  const request: CreateMessageRequest = {
    method: "sampling/createMessage",
    params: {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Hello",
          },
        },
      ],
      maxTokens: 100,
    },
  };

  const result = await registeredHandler(request);

  assertEquals(result.model, "test-model");
  assertEquals(result.role, "assistant");
  assertEquals(result.content.type, "text");
  assertEquals(result.content.text, "Test response");
  assertEquals(result.stopReason, "endTurn");
});

Deno.test("setupClientSampling - handles errors in handler", async () => {
  let registeredHandler: any = null;
  const mockClient = {
    setRequestHandler: (_schema: any, handler: any) => {
      registeredHandler = handler;
    },
  };

  setupClientSampling(mockClient as any, {
    handler: () => {
      return Promise.reject(new Error("Handler error"));
    },
  });

  const request: CreateMessageRequest = {
    method: "sampling/createMessage",
    params: {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Hello",
          },
        },
      ],
      maxTokens: 100,
    },
  };

  const result = await registeredHandler(request);

  assertEquals(result.model, "error");
  assertEquals(result.content.type, "text");
  if (result.content.type === "text") {
    assertEquals(result.content.text.includes("Handler error"), true);
  }
});
