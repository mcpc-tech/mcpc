import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import process from "node:process";

/**
 * Provider: Alibaba Cloud
 * @see https://www.alibabacloud.com/help/en/model-studio/developer-reference/use-qwen-by-calling-api
 * @see https://bailian.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=https%3A%2F%2Fwww.alibabacloud.com%2Fhelp%2Fzh%2Fdoc-detail%2F2840914.html
 */
export const qwen: OpenAIProvider = createOpenAI({
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.ALIBABA_TOKEN,
});
