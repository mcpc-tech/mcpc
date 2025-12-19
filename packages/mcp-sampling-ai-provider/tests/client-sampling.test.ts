/**
 * Tests for client sampling
 */

import { assertEquals } from "@std/assert";
import {
  createClientSampling,
  selectModelFromPreferences,
} from "../src/client-sampling.ts";
import {
  convertAISDKFinishReasonToMCP,
  convertMCPMessagesToAISDK,
} from "../src/utils.ts";
import type { CreateMessageRequest } from "@modelcontextprotocol/sdk/types.js";

Deno.test("convertMessagesToAISDK - text messages", () => {
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

Deno.test("convertMessagesToAISDK - image messages", () => {
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

Deno.test("convertFinishReason", () => {
  assertEquals(convertAISDKFinishReasonToMCP("stop"), "endTurn");
  assertEquals(convertAISDKFinishReasonToMCP("length"), "maxTokens");
  assertEquals(convertAISDKFinishReasonToMCP("content-filter"), "stopSequence");
  assertEquals(convertAISDKFinishReasonToMCP(undefined), "endTurn");
  assertEquals(convertAISDKFinishReasonToMCP("unknown"), "endTurn");
});

Deno.test("selectModelFromPreferences - exact hint match", () => {
  const preferences = {
    hints: [{ name: "gpt-4" }],
  };

  const model = selectModelFromPreferences(preferences, {
    hints: {
      "gpt-4": "gpt-4-turbo",
      "claude": "claude-3-opus",
    },
    default: "default-model",
  });

  assertEquals(model, "gpt-4-turbo");
});

Deno.test("selectModelFromPreferences - partial hint match", () => {
  const preferences = {
    hints: [{ name: "gpt-4-turbo-preview" }],
  };

  const model = selectModelFromPreferences(preferences, {
    hints: {
      "gpt-4": "gpt-4-turbo",
    },
    default: "default-model",
  });

  assertEquals(model, "gpt-4-turbo");
});

Deno.test("selectModelFromPreferences - speed priority", () => {
  const preferences = {
    speedPriority: 0.9,
  };

  const model = selectModelFromPreferences(preferences, {
    priorities: {
      speed: "gpt-3.5-turbo",
      intelligence: "gpt-4",
    },
    default: "default-model",
  });

  assertEquals(model, "gpt-3.5-turbo");
});

Deno.test("selectModelFromPreferences - intelligence priority", () => {
  const preferences = {
    intelligencePriority: 0.8,
  };

  const model = selectModelFromPreferences(preferences, {
    priorities: {
      speed: "gpt-3.5-turbo",
      intelligence: "gpt-4",
    },
    default: "default-model",
  });

  assertEquals(model, "gpt-4");
});

Deno.test("selectModelFromPreferences - default", () => {
  const preferences = {};

  const model = selectModelFromPreferences(preferences, {
    hints: {
      "gpt-4": "gpt-4-turbo",
    },
    default: "default-model",
  });

  assertEquals(model, "default-model");
});

Deno.test("createClientSampling - success", async () => {
  const handler = createClientSampling({
    handler: (params) => {
      assertEquals(params.messages.length, 1);
      assertEquals(params.messages[0].content, "Hello");

      return Promise.resolve({
        model: "test-model",
        role: "assistant" as const,
        content: { type: "text" as const, text: "Response text" },
        stopReason: "endTurn" as const,
      });
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
      temperature: 0.5,
      maxTokens: 100,
    },
  };

  const result = await handler(request);

  assertEquals(result.model, "test-model");
  assertEquals(result.role, "assistant");
  if (result.content.type === "text") {
    assertEquals(result.content.type, "text");
    assertEquals(result.content.text, "Response text");
  }
  assertEquals(result.stopReason, "endTurn");
});

Deno.test("createClientSampling - error handling", async () => {
  const handler = createClientSampling({
    handler: () => {
      return Promise.reject(new Error("Test error"));
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

  const result = await handler(request);

  assertEquals(result.model, "error");
  assertEquals(result.content.type, "text");
  if (result.content.type === "text") {
    assertEquals(result.content.text.includes("Test error"), true);
  }
});
