/**
 * AI SDK ACP Mode Plugin
 * Implements the "ai_acp" execution mode for ACP agents (Claude Code, etc.)
 */

import type { ToolPlugin } from "../../plugin-types.ts";
import {
  registerAIACPTool,
  type RegisterAIACPToolParams,
} from "../../executors/ai/ai-acp-registrar.ts";

export const createAIACPModePlugin = (): ToolPlugin => ({
  name: "mode-ai-acp",
  version: "1.0.0",
  apply: "ai_acp",

  registerAgentTool: (context) => {
    const opts = context.options as Partial<RegisterAIACPToolParams>;
    if (!opts.acpSettings) {
      throw new Error("ai_acp mode requires acpSettings in options");
    }
    registerAIACPTool(context.server, {
      description: context.description,
      name: context.name,
      allToolNames: context.allToolNames,
      depGroups: context.depGroups,
      acpSettings: opts.acpSettings,
      clientTools: opts.clientTools,
      maxSteps: opts.maxSteps,
      tracingEnabled: opts.tracingEnabled,
    });
  },
});

export default createAIACPModePlugin();
