import { jsonSchema } from "ai";
import type { RegisterWorkflowToolParams } from "../types.ts";
import { WorkflowState } from "../utils/state.ts";
import { createGoogleCompatibleJSONSchema } from "../utils/common/provider.ts";
import { WorkflowExecutor } from "./workflow-executor.ts";
import { createArgsDefFactory } from "./args-def-factory.ts";
import type { ComposableMCPServer } from "../compose.ts";
import { CompiledPrompts } from "../prompts/index.ts";

export function registerAgenticWorkflowTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
    predefinedSteps,
  }: RegisterWorkflowToolParams
) {
  const createArgsDef = createArgsDefFactory(name, allToolNames, depGroups, predefinedSteps);
  const executor = new WorkflowExecutor(name, allToolNames, toolNameToDetailList, createArgsDef, server, predefinedSteps);
  const workflowState = new WorkflowState();

  const planningInstructions = predefinedSteps 
    ? '- Set `init: true` (steps are predefined)'
    : '- Set `init: true` and define complete `steps` array';

  const toolDescription = CompiledPrompts.workflowExecution({
    toolName: name,
    description: description,
    planningInstructions: planningInstructions
  });

  server.tool(
    name,
    createArgsDef.forToolDescription(toolDescription, workflowState),
    jsonSchema<Record<string, unknown>>(
      createGoogleCompatibleJSONSchema(createArgsDef.forTool())
    ),
    async (args: Record<string, unknown>) => {
      try {
        return await executor.execute(args, workflowState);
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
    }
  );
}
