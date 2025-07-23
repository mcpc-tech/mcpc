import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import { jsonSchema, type Schema } from "ai";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RegisterToolParams } from "../types.ts";
import { createGoogleCompatibleJSONSchema } from "../utils/common/provider.ts";
import { ComposableMCPServer } from "../compose.ts";

interface MCPServer {
  tool: <T>(name: string, description: string, schema: Schema<T>, callback: (args: T) => unknown) => void;
}

const NEXT_ACTION_KEY = "nextAction";
const ACTION_KEY = "action";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});
// @ts-ignore -
addFormats(ajv);

export function registerAgenticTool(
  server: ComposableMCPServer,
  {
    description,
    name,
    allToolNames: _allToolNames, // Prefix with underscore to indicate it's intentionally unused
    depGroups,
    toolNameToDetailList,
  }: RegisterToolParams
) {
  description = `This is the autonomous MCP agent \`${name}\`. It fulfills user instructions by orchestrating actions via **iterative self-invocation(\`${name}\`)**. You MUST follow the instructions below to execute the workflow.

<instructions>${description}</instructions>

# Action Execution Protocol

This tool executes actions in a multi-step process. Follow these steps for each iteration:
1.  **Determine Current Action:** Based on user instructions, overall task goal, and prior results, identify the *single most appropriate action* for this step.
2.  **Anticipate Next Action (if any):** Plan and anticipate the likely *next action* needed to complete the task after the current step.

* Do not treat actions merely as simple tool calls.
* Always execute actions via this protocol. Do NOT attempt direct, unstructured calls.`;

  // Get all tools that should be available as actions (non-hidden external tools + internal tools)
  const externalToolNames = toolNameToDetailList.map(([name]) => name);
  const internalToolNames = server.getInternalToolNames();
  const availableActionNames = [...externalToolNames, ...internalToolNames];

  const allOf = toolNameToDetailList.map(([toolName, _toolDetail]: [string, unknown]) => {
    return {
      if: {
        properties: { [ACTION_KEY]: { const: toolName } },
        required: [ACTION_KEY],
      },
      then: {
        required: [toolName],
      },
    };
  });

  // Add internal tools to allOf array
  internalToolNames.forEach((toolName) => {
    allOf.push({
      if: {
        properties: { [ACTION_KEY]: { const: toolName } },
        required: [ACTION_KEY],
      },
      then: {
        required: [toolName],
      },
    });
  });

  const argsDef: Schema<Record<PropertyKey, never>>["jsonSchema"] = {
    additionalProperties: false,
    allOf,
    type: "object",
    properties: {
      [ACTION_KEY]: {
        type: "string",
        enum: availableActionNames, // Use available actions instead of allToolNames
        description:
          "Specifies the action to be performed from the enum. Based on the value chosen for 'action', the corresponding sibling property (which shares the same name as the action value and contains its specific parameters) **MUST** also be provided in this object. For example, if 'action' is 'get_weather', then the 'get_weather' parameter object is mandatory.",
      },
      [NEXT_ACTION_KEY]: {
        type: "string",
        enum: availableActionNames, // Use available actions instead of allToolNames
        description:
          "Specify the next action to execute only when the user's request requires additional steps. If no next action is needed, this property **MUST BE OMITTED** from the object.",
      },
      ...depGroups,
    },
    required: [ACTION_KEY],
  };
  const schema =
    availableActionNames.length > 0 ? argsDef : { type: "object", properties: {} };
  const validate = ajv.compile(schema);

  server.tool(
    name,
    description,
    jsonSchema<Record<string, unknown>>(createGoogleCompatibleJSONSchema(schema as Record<string, unknown>)),
    async (args: Record<string, unknown>) => {
      if (!validate(args)) {
        const errors = new AggregateAjvError(validate.errors!);
        return {
          content: [
            {
              type: "text",
              text: `Tool/Function argument validation failed: ${errors.message}`,
            },
          ],
          isError: true,
        };
      }

      const actionName = args[ACTION_KEY] as string;
      
      // First check external tools
      const currentTool = toolNameToDetailList.find(
        ([name, _detail]: [string, unknown]) => name === actionName
      )?.[1] as { execute: (args: unknown) => Promise<CallToolResult> } | undefined;

      if (currentTool) {
        // Execute external tool
        const nextAction = args[NEXT_ACTION_KEY] as string;
        const currentResult = await currentTool.execute({
          ...(args[actionName] as Record<string, unknown>),
        });

        if (args[nextAction]) {
          currentResult?.content?.unshift({
            type: "text",
            text: `# You WILL call this tool(\`${name}\`) AGAIN using the \`${nextAction}\` action, after evaluating the result from previous action(${actionName}):`,
          });
        } else {
          currentResult?.content?.unshift({
            type: "text",
            text: `# You WILL plan next action if the user request needs additional actions to be fulfilled, after evaluating the result from previous action(${actionName}):`,
          });
        }

        return currentResult;
      }

      // If not found in external tools, check internal tools
      if (internalToolNames.includes(actionName)) {
        try {
          const result = await server.callTool(actionName, args[actionName] as Record<string, unknown>);
          
          const nextAction = args[NEXT_ACTION_KEY] as string;
          const callToolResult = {
            content: [
              {
                type: "text" as const,
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ]
          };

          if (nextAction && availableActionNames.includes(nextAction)) {
            callToolResult.content.unshift({
              type: "text",
              text: `# You WILL call this tool(\`${name}\`) AGAIN using the \`${nextAction}\` action, after evaluating the result from previous action(${actionName}):`,
            });
          } else {
            callToolResult.content.unshift({
              type: "text",
              text: `# You WILL plan next action if the user request needs additional actions to be fulfilled, after evaluating the result from previous action(${actionName}):`,
            });
          }

          return callToolResult;
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error executing internal tool ${actionName}: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }

      // Tool not found
      return {
        content: [
          {
            type: "text",
            text: `Completed, no dependent tools to execute`,
          },
        ],
      };
    }
  );
}
