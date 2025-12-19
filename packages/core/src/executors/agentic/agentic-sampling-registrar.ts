import { jsonSchema } from "../../utils/schema.ts";
import type { SamplingConfig } from "../../types.ts";
import { createModelCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { SamplingExecutor } from "../sampling/agentic-sampling-executor.ts";
import type { ExternalTool } from "../sampling/base-sampling-executor.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";

export interface RegisterAgenticSamplingToolParams {
  description: string;
  name: string;
  allToolNames: string[];
  depGroups: Record<string, unknown>;
  toolNameToDetailList: [string, unknown][];
  samplingConfig?: SamplingConfig;
}

export function registerAgenticSamplingTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
    samplingConfig,
  }: RegisterAgenticSamplingToolParams,
) {
  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
    undefined,
    undefined,
  );

  // Create sampling executor
  const samplingExecutor = new SamplingExecutor(
    name,
    description,
    allToolNames,
    toolNameToDetailList as [string, ExternalTool][],
    server,
    samplingConfig,
  );

  // Build tool description using the dedicated template
  const toolDescription = CompiledPrompts.samplingToolDescription({
    description,
    toolList: allToolNames.map((name) => `- ${name}`).join("\n"),
  });

  // Use sampling-specific args definition
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
    async (args: Record<string, unknown>) => {
      return await samplingExecutor.executeSampling(
        args,
        schema as Record<string, unknown>,
      );
    },
  );
}
