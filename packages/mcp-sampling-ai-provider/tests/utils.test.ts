/**
 * Tests for shared utility functions
 */

import { assertEquals } from "@std/assert";
import {
  convertAISDKFinishReasonToMCP,
  convertAISDKToMCPMessages,
  convertMCPMessagesToAISDK,
  convertMCPStopReasonToAISDK,
} from "../src/utils.ts";
import type { LanguageModelV2Prompt } from "@ai-sdk/provider";
import type { CreateMessageRequest } from "@modelcontextprotocol/sdk/types.js";

Deno.test("convertMCPMessagesToAISDK - text messages", () => {
  const mcpMessages: CreateMessageRequest["params"]["messages"] = [
    {
      role: "user",
      content: {
        type: "text",
        text: "Hello",
      },
    },
    {
      role: "assistant",
      content: {
        type: "text",
        text: "Hi there",
      },
    },
  ];

  const result = convertMCPMessagesToAISDK(mcpMessages);

  assertEquals(result.length, 2);
  assertEquals(result[0].role, "user");
  assertEquals(result[0].content, "Hello");
  assertEquals(result[1].role, "assistant");
  assertEquals(result[1].content, "Hi there");
});

Deno.test("convertMCPMessagesToAISDK - image messages", () => {
  const mcpMessages: CreateMessageRequest["params"]["messages"] = [
    {
      role: "user",
      content: {
        type: "image",
        data: "base64data",
        mimeType: "image/png",
      },
    },
  ];

  const result = convertMCPMessagesToAISDK(mcpMessages);

  assertEquals(result.length, 1);
  assertEquals(result[0].role, "user");
  assertEquals(Array.isArray(result[0].content), true);
  if (Array.isArray(result[0].content)) {
    const imageContent = result[0].content[0];
    if ("image" in imageContent) {
      assertEquals(imageContent.type, "image");
      assertEquals(imageContent.image, "data:image/png;base64,base64data");
    }
  }
});

Deno.test("convertAISDKToMCPMessages - simple text", () => {
  const aiPrompt: LanguageModelV2Prompt = [
    {
      role: "user",
      content: [{ type: "text", text: "Hello world" }],
    },
  ];

  const result = convertAISDKToMCPMessages(aiPrompt);

  assertEquals(result.length, 1);
  assertEquals(result[0].role, "user");
  const content = result[0].content;
  if (!Array.isArray(content) && content.type === "text") {
    assertEquals(content.type, "text");
    assertEquals(content.text, "Hello world");
  }
});

Deno.test("convertAISDKToMCPMessages - tool calls", () => {
  const aiPrompt: LanguageModelV2Prompt = [
    {
      role: "assistant",
      content: [
        { type: "text", text: "Let me search for that" },
        {
          type: "tool-call",
          toolCallId: "call1",
          toolName: "search",
          args: '{"query":"test"}',
        } as any,
      ],
    },
  ];

  const result = convertAISDKToMCPMessages(aiPrompt);

  assertEquals(result.length, 1);
  assertEquals(result[0].role, "assistant");
  const content = result[0].content;
  if (!Array.isArray(content) && content.type === "text") {
    assertEquals(content.type, "text");
    assertEquals(
      content.text.includes("Let me search for that"),
      true,
    );
    assertEquals(
      content.text.includes('<use_tool tool="search">'),
      true,
    );
  }
});

Deno.test("convertAISDKToMCPMessages - skips system messages", () => {
  const aiPrompt: LanguageModelV2Prompt = [
    {
      role: "system",
      content: "You are helpful",
    },
    {
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    },
  ];

  const result = convertAISDKToMCPMessages(aiPrompt);

  assertEquals(result.length, 1);
  assertEquals(result[0].role, "user");
});

Deno.test("convertAISDKFinishReasonToMCP", () => {
  assertEquals(convertAISDKFinishReasonToMCP("stop"), "endTurn");
  assertEquals(convertAISDKFinishReasonToMCP("length"), "maxTokens");
  assertEquals(convertAISDKFinishReasonToMCP("content-filter"), "stopSequence");
  assertEquals(convertAISDKFinishReasonToMCP(undefined), "endTurn");
  assertEquals(convertAISDKFinishReasonToMCP("unknown"), "endTurn");
});

Deno.test("convertMCPStopReasonToAISDK", () => {
  assertEquals(convertMCPStopReasonToAISDK("endTurn"), "stop");
  assertEquals(convertMCPStopReasonToAISDK("stopSequence"), "stop");
  assertEquals(convertMCPStopReasonToAISDK("maxTokens"), "length");
  assertEquals(convertMCPStopReasonToAISDK(undefined), "unknown");
  assertEquals(convertMCPStopReasonToAISDK("other"), "other");
});
