import { jsonSchema } from "ai";
import type { RegisterWorkflowToolParams } from "../../types.ts";
import { WorkflowState } from "../../utils/state.ts";
import { createGoogleCompatibleJSONSchema } from "../../utils/common/provider.ts";
import { WorkflowExecutor } from "./workflow-executor.ts";
import type { ComposableMCPServer } from "../../compose.ts";
import { CompiledPrompts } from "../../prompts/index.ts";
import { createArgsDefFactory } from "../../factories/args-def-factory.ts";
import { WorkflowSamplingExecutor } from "../sampling/workflow-sampling-executor.ts";
import type { ExternalTool } from "../sampling/base-sampling-executor.ts";

export function registerAgenticWorkflowTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
    predefinedSteps,
    sampling = false,
  }: RegisterWorkflowToolParams,
) {
  const createArgsDef = createArgsDefFactory(
    name,
    allToolNames,
    depGroups,
    predefinedSteps,
  );
  
  // Create executors
  const workflowExecutor = new WorkflowExecutor(
    name,
    allToolNames,
    toolNameToDetailList,
    createArgsDef,
    server,
    predefinedSteps,
  );

  const workflowSamplingExecutor = new WorkflowSamplingExecutor(
    name,
    description,
    allToolNames,
    toolNameToDetailList as [string, ExternalTool][],
    createArgsDef,
    server,
    predefinedSteps,
  );
  
  const workflowState = new WorkflowState();

  // Generate description based on mode
  const baseDescription = sampling
    ? CompiledPrompts.samplingExecution({
        toolName: name,
        description,
        toolList: allToolNames.map((name) => `- ${name}`).join("\n"),
      })
    : CompiledPrompts.workflowExecution({
        toolName: name,
        description: description,
      });

  // Generate schema based on mode
  const argsDef = sampling
    ? createArgsDef.forSampling()
    : createArgsDef.forTool();

  const toolDescription = sampling
    ? baseDescription
    : createArgsDef.forToolDescription(baseDescription, workflowState);

  server.tool(
    name,
    toolDescription,
    jsonSchema<Record<string, unknown>>(
      createGoogleCompatibleJSONSchema(argsDef),
    ),
    async (args: Record<string, unknown>) => {
      try {
        // Use appropriate executor based on mode
        if (sampling) {
          return await workflowSamplingExecutor.executeWorkflowSampling(
            args as Record<string, unknown>,
            argsDef as Record<string, unknown>,
            workflowState,
          );
        } else {
          return await workflowExecutor.execute(args, workflowState);
        }
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
