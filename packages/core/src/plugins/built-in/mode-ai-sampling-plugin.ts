/**
 * AI SDK Sampling Mode Plugin
 * Implements the "ai_sampling" execution mode using AI SDK's streamText with stopWhen
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import {
  registerAISamplingTool,
  type RegisterAISamplingToolParams,
} from "../../executors/ai/ai-sampling-registrar.ts";

export const createAISamplingModePlugin = (): ToolPlugin => ({
  name: "mode-ai-sampling",
  version: "1.0.0",
  apply: "ai_sampling",

  registerAgentTool: (context) => {
    const opts = context.options as Partial<RegisterAISamplingToolParams>;
    registerAISamplingTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      toolNameToDetailList: context.toolNameToDetailList,
      providerOptions: opts.providerOptions,
      maxSteps: opts.maxSteps,
      tracingEnabled: opts.tracingEnabled,
    });
  },
});

export default createAISamplingModePlugin();
