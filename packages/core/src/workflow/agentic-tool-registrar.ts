import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import { jsonSchema, type Schema } from "ai";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { RegisterToolParams } from "../types.ts";
import { createGoogleCompatibleJSONSchema } from "../utils/common/provider.ts";

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
  server: MCPServer,
  {
    description,
    name,
    allToolNames,
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

  const argsDef: Schema<Record<PropertyKey, never>>["jsonSchema"] = {
    additionalProperties: false,
    allOf,
    type: "object",
    properties: {
      [ACTION_KEY]: {
        type: "string",
        enum: allToolNames,
        description:
          "Specifies the action to be performed from the enum. Based on the value chosen for 'action', the corresponding sibling property (which shares the same name as the action value and contains its specific parameters) **MUST** also be provided in this object. For example, if 'action' is 'get_weather', then the 'get_weather' parameter object is mandatory.",
      },
      [NEXT_ACTION_KEY]: {
        type: "string",
        enum: allToolNames,
        description:
          "Specify the next action to execute only when the user's request requires additional steps. If no next action is needed, this property **MUST BE OMITTED** from the object.",
      },
      ...depGroups,
    },
    required: [ACTION_KEY],
  };
  const schema =
    allToolNames.length > 0 ? argsDef : { type: "object", properties: {} };
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

      const currentTool = toolNameToDetailList.find(
        ([name, _detail]: [string, unknown]) => name === args[ACTION_KEY]
      )?.[1] as { execute: (args: unknown) => Promise<CallToolResult> } | undefined;

      if (!currentTool) {
        return {
          content: [
            {
              type: "text",
              text: `Compeleted, no dependent tools to execute`,
            },
          ],
        };
      }

      const action = args[ACTION_KEY] as string;
      const nextAction = args[NEXT_ACTION_KEY] as string;
      const currentResult = await currentTool.execute({
        ...(args[action] as Record<string, unknown>),
      });

      if (args[nextAction]) {
        currentResult?.content?.unshift({
          type: "text",
          text: `# You WILL call this tool(\`${name}\`) AGAIN using the \`${nextAction}\` action, after evaluating the result from previous action(${action}):`,
        });
      } else {
        currentResult?.content?.unshift({
          type: "text",
          text: `# You WILL plan next action if the user request needs additional actions to be fulfilled, after evaluating the result from previous action(${action}):`,
        });
      }

      return currentResult;
    }
  );
}
