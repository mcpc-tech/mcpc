/**
 * AI SDK ACP Tool Registrar
 */

import { jsonSchema } from "../../utils/schema.ts";
import { createModelCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { type ACPProviderSettings, AIACPExecutor } from "./ai-acp-executor.ts";
import type { ExternalTool } from "./base-ai-executor.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";

export interface RegisterAIACPToolParams {
  description: string;
  name: string;
  allToolNames: string[];
  depGroups: Record<string, unknown>;
  acpSettings: ACPProviderSettings;
  clientTools?: [string, ExternalTool][];
  maxSteps?: number;
  tracingEnabled?: boolean;
}

export function registerAIACPTool(
  server: ComposableMCPServer,
  params: RegisterAIACPToolParams,
) {
  const {
    name,
    description,
    allToolNames,
    depGroups,
    acpSettings,
    clientTools = [],
    maxSteps = 50,
    tracingEnabled = false,
  } = params;

  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
    undefined,
    undefined,
  );
  const executor = new AIACPExecutor({
    name,
    description,
    acpSettings,
    clientTools,
    maxSteps,
    tracingEnabled,
  });

  const toolDescription = CompiledPrompts.samplingToolDescription({
    toolName: name,
    description,
    toolList: allToolNames.length > 0
      ? allToolNames.map((n) => `- ${n}`).join("\n")
      : "Agent has its own tools",
  });

  const argsDef = createArgsDef.forSampling();
  const schema = allToolNames.length > 0
    ? argsDef
    : { type: "object", properties: {} };

  server.tool(
    name,
    toolDescription,
    jsonSchema<Record<string, unknown>>(
      createModelCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    (args: Record<string, unknown>) => {
      const userRequest = typeof args.userRequest === "string"
        ? args.userRequest
        : JSON.stringify(args);
      return executor.execute({
        userRequest,
        context: args.context as Record<string, unknown>,
      });
    },
  );

  return executor; // For manual cleanup
}
