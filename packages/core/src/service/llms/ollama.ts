import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import { LanguageModelV1, wrapLanguageModel } from "ai";
import { imitateToolUseMiddleware } from "../../middleware/imitate-tool-use.middleware.ts";
import { parseThinkingEventsMiddleware } from "../../middleware/thinking.middleware.ts";
import { WecomIncomingParams } from "@mcpc/core";
import process from "node:process";

export const _ollama: OpenAIProvider = createOpenAI({
  apiKey: "ollama",
  baseURL: process.env.OLLAMA_BASE_URL,

  fetch: async (req, options) => {
    console.log("[ollama] request", req);
    try {
      const res = await fetch(req, options);
      console.log(`[ollama] responsed`);
      return res;
    } catch (e) {
      console.error("[ollama] error", e);
      throw e;
    }
  },
});

export const ollama: (
  model: string,
  params: WecomIncomingParams
) => Promise<LanguageModelV1> = async (
  model: string,
  params: WecomIncomingParams
) => {
  const baseModel = _ollama(model);

  // Create the wrapped model with middleware
  const wrappedModel = wrapLanguageModel({
    model: baseModel,
    middleware: [
      parseThinkingEventsMiddleware(),
      imitateToolUseMiddleware(params),
    ],
  });

  return wrappedModel;
};
