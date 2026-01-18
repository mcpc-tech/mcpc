/**
 * AI SDK Sampling Tool Registrar
 */

import { jsonSchema } from "../../utils/schema.ts";
import { createModelCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { AISamplingExecutor } from "./ai-sampling-executor.ts";
import type { ExternalTool } from "./base-ai-executor.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";
import type { MCPSamplingProviderOptions } from "@mcpc/mcp-sampling-ai-provider";
import { validateSchema } from "../../utils/schema-validator.ts";

export interface RegisterAISamplingToolParams {
  description: string;
  name: string;
  allToolNames: string[];
  depGroups: Record<string, unknown>;
  toolNameToDetailList: [string, unknown][];
  providerOptions?: MCPSamplingProviderOptions;
  maxSteps?: number;
  tracingEnabled?: boolean;
}

export function registerAISamplingTool(
  server: ComposableMCPServer,
  params: RegisterAISamplingToolParams,
) {
  const {
    name,
    description,
    allToolNames,
    depGroups,
    toolNameToDetailList,
    providerOptions,
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
  const executor = new AISamplingExecutor({
    name,
    description,
    server,
    tools: toolNameToDetailList as [string, ExternalTool][],
    providerOptions,
    maxSteps,
    tracingEnabled,
  });

  const toolDescription = CompiledPrompts.samplingToolDescription({
    toolName: name,
    description,
    toolList: allToolNames.map((n) => `- ${n}`).join("\n"),
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
      // Validate args against schema before execution
      const validationResult = validateSchema(
        args,
        schema as Record<string, unknown>,
      );
      if (!validationResult.valid) {
        return {
          content: [
            {
              type: "text" as const,
              text: CompiledPrompts.errorResponse({
                errorMessage: validationResult.error || "Validation failed",
              }),
            },
          ],
          isError: true,
        };
      }

      const prompt = typeof args.prompt === "string"
        ? args.prompt
        : JSON.stringify(args);
      return executor.execute({
        prompt,
        context: args.context as Record<string, unknown>,
      });
    },
  );
}
