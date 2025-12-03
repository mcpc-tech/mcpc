import { jsonSchema, type Schema } from "../../utils/schema.ts";
import type { RegisterToolParams } from "../../types.ts";
import { createModelCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { AgenticExecutor } from "./agentic-executor.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";

export function registerAgenticTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
  }: RegisterToolParams,
) {
  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
    undefined,
    undefined,
  );

  // Create executor
  const agenticExecutor = new AgenticExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    server,
  );

  description = CompiledPrompts.autonomousExecution({
    toolName: name,
    description,
  });

  const agenticArgsDef = createArgsDef.forAgentic(
    toolNameToDetailList,
    false, // not sampling mode
  );
  const argsDef: Schema<Record<PropertyKey, never>>["jsonSchema"] =
    agenticArgsDef;
  const schema = allToolNames.length > 0
    ? argsDef
    : { type: "object", properties: {} };

  server.tool(
    name,
    description,
    jsonSchema<Record<string, unknown>>(
      createModelCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    async (args: Record<string, unknown>) => {
      return await agenticExecutor.execute(
        args,
        schema as Record<string, unknown>,
      );
    },
  );
}
