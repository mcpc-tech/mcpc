/**
 * Client Sampling Utility
 *
 * This module provides utilities for MCP clients that don't natively support sampling.
 * It offers a simple configuration-based API to add sampling capability to any MCP client.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/client/sampling
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  type CreateMessageRequest,
  CreateMessageRequestSchema,
  type CreateMessageResult,
} from "@modelcontextprotocol/sdk/types.js";
import { type AISDKMessage, convertMCPMessagesToAISDK } from "./utils.ts";

/**
 * AI SDK handler function type
 */
export type AISDKHandler = (params: {
  messages: AISDKMessage[];
  modelPreferences?: CreateMessageRequest["params"]["modelPreferences"];
  tools?: CreateMessageRequest["params"]["tools"];
  helpers?: {
    tool: (...args: any[]) => any;
    jsonSchema: (...args: any[]) => any;
  };
}) => Promise<CreateMessageResult>;

/**
 * Client sampling configuration
 */
export interface ClientSamplingConfig {
  /**
   * AI SDK handler function that generates completions
   */
  handler: AISDKHandler;

  /**
   * AI SDK helpers for tool conversion (tool and jsonSchema from "ai" package)
   * Required for proper tool support when MCP server sends tools in createMessage request
   */
  helpers?: {
    tool: (...args: any[]) => any;
    jsonSchema: (...args: any[]) => any;
  };

  /**
   * Optional model selection map for preference-based routing
   */
  modelMap?: {
    hints?: Record<string, string>;
    priorities?: {
      speed?: string;
      intelligence?: string;
      cost?: string;
    };
    default?: string;
  };
}

/**
 * Create a configured client sampling handler
 *
 * This is the main entry point for adding sampling support to MCP clients.
 * It takes a configuration object and returns a ready-to-use sampling handler.
 *
 * @param config - Client sampling configuration
 * @returns MCP sampling handler function
 *
 * @example
 * ```typescript
 * import { createClientSampling } from "@mcpc/mcp-sampling-ai-provider";
 * import { generateText } from "ai";
 *
 * const samplingHandler = createClientSampling({
 *   handler: async (params) => {
 *     const result = await generateText({
 *       model: "openai/gpt-5-mini",
 *       messages: params.messages,
 *     });
 *     return {
 *       model: "openai/gpt-5-mini",
 *       role: "assistant",
 *       content: { type: "text", text: result.text },
 *       stopReason: result.finishReason === "stop" ? "endTurn" : "maxTokens",
 *     };
 *   },
 * });
 *
 * server.setRequestHandler(CreateMessageRequestSchema, samplingHandler);
 * ```
 */
export function createClientSampling(
  config: ClientSamplingConfig,
): (request: CreateMessageRequest) => Promise<CreateMessageResult> {
  return async (request: CreateMessageRequest) => {
    const {
      messages,
      modelPreferences,
      tools,
    } = request.params;

    try {
      const aiMessages = convertMCPMessagesToAISDK(messages);

      if (aiMessages.length === 0) {
        aiMessages.push({ role: "user", content: "continue" });
      }

      return await config.handler({
        messages: aiMessages,
        modelPreferences,
        tools,
        helpers: config.helpers,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        model: "error",
        role: "assistant",
        content: { type: "text", text: `Sampling failed: ${err.message}` },
        stopReason: "endTurn",
      };
    }
  };
}

/**
 * Helper to select model based on MCP model preferences
 *
 * @param preferences - MCP model preferences
 * @param modelMap - Map of hint names/priorities to your model identifiers
 * @returns Selected model identifier
 *
 * @example
 * ```typescript
 * const model = selectModelFromPreferences(modelPreferences, {
 *   hints: {
 *     "gpt-4o": "openai/gpt-4o",
 *     "claude": "anthropic/claude-3-5-sonnet-20241022",
 *   },
 *   priorities: {
 *     speed: "openai/gpt-4o-mini",
 *     intelligence: "openai/gpt-4o",
 *     cost: "openai/gpt-4o-mini",
 *   },
 *   default: "openai/gpt-5-mini",
 * });
 * ```
 */
export function selectModelFromPreferences(
  preferences: CreateMessageRequest["params"]["modelPreferences"] | undefined,
  modelMap: {
    /**
     * Map hint names to model identifiers
     */
    hints?: Record<string, string>;
    /**
     * Map priority types to model identifiers
     */
    priorities?: {
      speed?: string;
      intelligence?: string;
      cost?: string;
    };
    /**
     * Default model if no match found
     */
    default: string;
  },
): string {
  // Check model hints first
  if (preferences?.hints && modelMap.hints) {
    for (const hint of preferences.hints) {
      if (!hint.name) continue;

      // Try exact match
      if (modelMap.hints[hint.name]) {
        return modelMap.hints[hint.name];
      }

      // Try partial match
      for (const [key, value] of Object.entries(modelMap.hints)) {
        if (hint.name.includes(key) || key.includes(hint.name)) {
          return value;
        }
      }
    }
  }

  // Check priority preferences
  if (modelMap.priorities) {
    if (
      preferences?.speedPriority &&
      preferences.speedPriority > 0.7 &&
      modelMap.priorities.speed
    ) {
      return modelMap.priorities.speed;
    }

    if (
      preferences?.intelligencePriority &&
      preferences.intelligencePriority > 0.7 &&
      modelMap.priorities.intelligence
    ) {
      return modelMap.priorities.intelligence;
    }

    if (
      preferences?.costPriority &&
      preferences.costPriority > 0.7 &&
      modelMap.priorities.cost
    ) {
      return modelMap.priorities.cost;
    }
  }

  // Return default
  return modelMap.default;
}

/**
 * Add sampling support to an existing MCP client
 *
 * This function configures an existing MCP Client instance to handle sampling requests
 * from the server. It sets up the necessary request handler for createMessage requests.
 *
 * @param client - Existing MCP Client instance
 * @param config - Sampling handler configuration
 *
 * @example
 * ```typescript
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 * import { setupClientSampling } from "@mcpc/mcp-sampling-ai-provider";
 * import { generateText } from "ai";
 *
 * const client = new Client(
 *   { name: "my-client", version: "1.0.0" },
 *   { capabilities: { sampling: {} } }
 * );
 *
 * setupClientSampling(client, {
 *   handler: async (params) => {
 *     const result = await generateText({
 *       model: "openai/gpt-5-mini",
 *       messages: params.messages,
 *     });
 *     return {
 *       model: "openai/gpt-5-mini",
 *       role: "assistant",
 *       content: { type: "text", text: result.text },
 *       stopReason: result.finishReason === "stop" ? "endTurn" : "maxTokens",
 *     };
 *   },
 * });
 *
 * await client.connect(transport);
 * ```
 */
export function setupClientSampling(
  client: Client,
  config: ClientSamplingConfig,
): void {
  const samplingHandler = createClientSampling(config);
  client.setRequestHandler(CreateMessageRequestSchema, samplingHandler);
}
