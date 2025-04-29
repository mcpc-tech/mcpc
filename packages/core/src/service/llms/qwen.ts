import { createOpenAI, OpenAIProvider } from "@ai-sdk/openai";
import process from "node:process";

/**
 * Provider: Alibaba Cloud
 * @see https://www.alibabacloud.com/help/en/model-studio/developer-reference/use-qwen-by-calling-api
 * @see https://bailian.console.alibabacloud.com/?spm=a2c81._default.console-base_search-panel.dtab-product_sfm.25317259t1SBwc&scm=20140722.S_sfm._.ID_sfm-RL_model-LOC_console_console-OR_ser-V_4-P0_0#/model-market for models list
 */
export const qwen: OpenAIProvider = createOpenAI({
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  apiKey: process.env.ALIBABA_TOKEN,
});
