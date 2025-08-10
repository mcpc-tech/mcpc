import { jsonSchema, type Schema } from "ai";
import type { RegisterToolParams } from "../../types.ts";
import { createGoogleCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { AgenticExecutor } from "./agentic-executor.ts";
import { SamplingExecutor } from "../sampling/agentic-sampling-executor.ts";
import type { ExternalTool } from "../sampling/base-sampling-executor.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";

interface MCPServer {
  tool: <T>(
    name: string,
    description: string,
    schema: Schema<T>,
    callback: (args: T) => unknown,
  ) => void;
}

export function registerAgenticTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
    sampling = false,
  }: RegisterToolParams,
) {
  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
  );

  // Create executors
  const agenticExecutor = new AgenticExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    server,
  );

  const samplingExecutor = new SamplingExecutor(
    name,
    description,
    allToolNames,
    toolNameToDetailList as [string, ExternalTool][],
    server,
  );

  description = sampling
    ? CompiledPrompts.samplingExecution({
      toolName: name,
      description,
      toolList: allToolNames.map((name) => `- ${name}`).join("\n"),
    })
    : CompiledPrompts.autonomousExecution({
      toolName: name,
      description,
    });

  const agenticArgsDef = createArgsDef.forAgentic(
    toolNameToDetailList,
    false, // not sampling mode
  );
  const argsDef: Schema<Record<PropertyKey, never>>["jsonSchema"] = sampling
    ? createArgsDef.forSampling()
    : agenticArgsDef;
  const schema = allToolNames.length > 0
    ? argsDef
    : { type: "object", properties: {} };

  server.tool(
    name,
    description,
    jsonSchema<Record<string, unknown>>(
      createGoogleCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    async (args: Record<string, unknown>) => {
      // Use appropriate executor based on mode
      if (sampling) {
        return await samplingExecutor.executeSampling(
          args,
          schema as Record<string, unknown>,
        );
      } else {
        return await agenticExecutor.execute(
          args,
          schema as Record<string, unknown>,
        );
      }
    },
  );
}
