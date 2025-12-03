import { jsonSchema } from "../../utils/schema.ts";
import type { SamplingConfig } from "../../types.ts";
import type { MCPCStep } from "../../utils/state.ts";
import { WorkflowState } from "../../utils/state.ts";
import { createModelCompatibleJSONSchema } from "../../utils/common/provider.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";
import { WorkflowSamplingExecutor } from "../sampling/workflow-sampling-executor.ts";
import type { ExternalTool } from "../sampling/base-sampling-executor.ts";

export interface RegisterWorkflowSamplingToolParams {
  description: string;
  name: string;
  allToolNames: string[];
  depGroups: Record<string, unknown>;
  toolNameToDetailList: [string, unknown][];
  predefinedSteps?: MCPCStep[];
  samplingConfig?: SamplingConfig;
  ensureStepActions?: string[];
  toolNameToIdMapping?: Map<string, string>;
}

export function registerWorkflowSamplingTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
    predefinedSteps,
    samplingConfig,
    ensureStepActions,
    toolNameToIdMapping: _toolNameToIdMapping,
  }: RegisterWorkflowSamplingToolParams,
) {
  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
    predefinedSteps,
    ensureStepActions,
  );

  // Create sampling executor
  const workflowSamplingExecutor = new WorkflowSamplingExecutor(
    name,
    description,
    allToolNames,
    toolNameToDetailList as [string, ExternalTool][],
    createArgsDef,
    server,
    predefinedSteps,
    samplingConfig,
  );

  const workflowState = new WorkflowState();

  // Use sampling-specific prompt
  const baseDescription = CompiledPrompts.samplingExecution({
    toolName: name,
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
    baseDescription,
    jsonSchema<Record<string, unknown>>(
      createModelCompatibleJSONSchema(schema as Record<string, unknown>),
    ),
    async (args: Record<string, unknown>) => {
      try {
        return await workflowSamplingExecutor.executeWorkflowSampling(
          args,
          schema as Record<string, unknown>,
          workflowState,
        );
      } catch (error) {
        workflowState.reset();
        return {
          content: [
            {
              type: "text",
              text: `Workflow execution error: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
