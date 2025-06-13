import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  Implementation,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, Schema } from "ai";
import { McpSettingsSchema } from "./service/tools.ts";
import {
  Server,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import { Ajv } from "ajv";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import addFormats from "ajv-formats";
import z from "zod";
import { composeMcpDepTools, parseTags } from "../mod.ts";
import { ComposeDefination } from "./set-up-mcp-compose.ts";
import { pick } from "@es-toolkit/es-toolkit";
import { MCPCStep, WorkflowState } from "./utils/state.ts";
import { createGoogleCompatibleJSONSchema } from "./utils/common/provider.ts";
import { internalActions, toolNameToSchema } from "./utils/actions.ts";
import { ENFORE_REASONING } from "./utils/common/config.ts";

const TOOLS_PLACEHOLDER = "__ALL__";

const NEXT_ACTION_KEY = "nextAction";
const ACTION_KEY = "action";

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});
// @ts-ignore -
addFormats(ajv);

/**
 * Helper type to extract variable names (inside {}) from a template string literal.
 * e.g., ExtractVariables<"Hello {name}! You are {age}."> -> "name" | "age"
 */
type ExtractVariables<S extends string> =
  S extends `${string}{${infer Var}}${infer Rest}`
    ? Var extends `${infer ActualVar}}` // Handle potential extra '}' if no Rest or adjacent braces
      ? ActualVar | ExtractVariables<Rest>
      : Var | ExtractVariables<Rest> // Standard case {var}
    : never;

/**
 * Type for the input object required by the formatting function.
 * Maps extracted variable names to allowed input types (string, number, boolean).
 */
type PromptInput<T extends string> = Record<
  ExtractVariables<T>,
  string | number | boolean
>;

export interface MCPCOptions {}

export class ComposableMCPServer extends Server {
  private tools: Tool[] = [];
  private nameToCb: Map<string, (args: any, extra?: any) => any> = new Map();

  constructor(_serverInfo: Implementation, options: ServerOptions) {
    super(_serverInfo, options);
  }

  tool<T>(
    name: string,
    description: string,
    paramsSchema: Schema<T>,
    cb: (args: T, extra?: any) => any
  ) {
    const tools: Tool[] = [
      ...this.tools,
      {
        name,
        description,
        inputSchema: paramsSchema.jsonSchema as any,
      },
    ];
    this.tools = tools;
    this.nameToCb.set(name, cb);

    this.setRequestHandler(ListToolsRequestSchema, () => {
      return { tools: this.tools };
    });

    this.setRequestHandler(CallToolRequestSchema, (request, extra) => {
      const { name: n, arguments: args } = request.params;
      return this.nameToCb.get(n)?.(args, extra);
    });
  }

  async compose(
    name: string,
    description: string,
    depsConfig: z.infer<typeof McpSettingsSchema>,
    options: ComposeDefination["options"] = { mode: "agentic_workflow" }
  ) {
    const { tagToResults, $ } = parseTags(description, ["tool", "fn"]);
    const tools = await composeMcpDepTools(
      depsConfig,
      ({ mcpName, toolNameWithScope, internalToolName, toolId }) => {
        return tagToResults.tool.find((tool) => {
          const selectAll =
            tool.attribs.name === `${mcpName}.${TOOLS_PLACEHOLDER}`;

          description = description.replace(
            $(tool).prop("outerHTML")!,
            `<action ${ACTION_KEY}="${toolId}"/>`
          );
          if (selectAll) {
            return true;
          }
          return tool.attribs.name === toolNameWithScope;
        });
      }
    );

    const toolNameToDetailList = Object.entries(tools);
    const allToolNames = toolNameToDetailList.map(([name]) => name);
    console.log(`[${name}][composed tools] ${Object.keys(tools)}`);
    const depGroups: any = toolNameToDetailList
      .flatMap(([toolName, tool]) => {
        if (!tool) {
          throw new Error(
            `Action ${toolName} not found, available action list: ${allToolNames.join(
              ", "
            )}`
          );
        }

        const baseSchema = tool.inputSchema || {
          type: "object",
          properties: {},
          required: [],
        };

        const baseProperties =
          baseSchema.type === "object" && baseSchema.properties
            ? baseSchema.properties
            : {};
        const baseRequired =
          baseSchema.type === "object" && baseSchema.required
            ? baseSchema.required
            : [];

        return {
          [toolName]: {
            type: "object",
            description: tool.description,
            properties: {
              ...baseProperties,
            },

            required: [...baseRequired],
            additionalProperties: false,
          },
        } as any;
      })
      .reduce((acc: any, cur: any) => ({ ...acc, ...cur }), {});

    switch (options.mode) {
      case "agentic":
        await this.registerTool({
          description,
          name,
          allToolNames,
          depGroups,
          toolNameToDetailList,
        });
        return;
      case "agentic_workflow":
        await this.registerAgenticWorkflowTool({
          description,
          name,
          allToolNames,
          depGroups,
          toolNameToDetailList,
        });
        return;
    }
  }

  async registerAgenticWorkflowTool({
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
  }: any) {
    const createArgsDef = {
      common: (
        extra: { [n: string]: Schema<{}>["jsonSchema"] },
        includeRepeat: boolean
      ): Schema<{}>["jsonSchema"] => ({
        type: "object",
        description: `**Object structured according to the tool's JSON Schema argument definition**`,
        properties: {
          ...(includeRepeat
            ? {
                repeat: {
                  type: "boolean",
                  description:
                    "**Controls step execution flow. Set to true to repeat the current step**",
                  default: false,
                },
              }
            : {}),
          ...extra,
        },
        required: Object.keys(extra).filter((n) => n !== "steps"),
        additionalProperties: true,
      }),

      steps: (): Schema<{}>["jsonSchema"] => ({
        type: "array",
        description: `
An array of step objects that define a sequence of COMPLETE actions as part of a workflow to be executed to fulfill the user's request.

CRITICAL:
-   **Workflow as a Sequence of States**: Steps MUST be organized to reflect the workflow's logical sequence. Each step represents a distinct phase.
-   **Sequential Dependency Rule**: If Action B depends on the outcome of Action A, they MUST be in separate, sequential steps (A in Step N, B in Step N+1).
-   **Concurrent Action Rule**: All actions within a single step are considered independent and MUST be executable concurrently.
-   **Action Fidelity Rule**: The set of generated actions MUST be a complete and faithful one-to-one mapping of the operations requested in the user's description. Do NOT omit requested ones.

BEST PRACTICES:
-   **Atomicity**: A step should be as atomic as possible.
-   **Idempotency**: Actions should be designed to be idempotent for safe retries.
-   **Clarity over Brevity**: Prefer more, smaller, focused steps over fewer, complex ones.
`,
        items: {
          type: "object",
          description: `
          A single step containing actions that execute concurrently.
          All actions in this step run simultaneously with no guaranteed order.
        `,
          properties: {
            description: {
              type: "string",
              description: `**Describes what a step does, what it needs from previous steps or context, and what it outputs.**`,
            },
            actions: {
              type: "array",
              description: `Array of action names that execute concurrently in this step.`,
              items: {
                type: "string",
                enum: allToolNames?.concat(Object.keys(internalActions)),
                description: `Individual action name from available actions
Available actions:
${Object.entries(internalActions).map(
  ([name, { description }]) => `- \`${name}\`: ${description}\n`
)}
${toolNameToDetailList.map(
  ([name, { description }]: [string, any]) => `- \`${name}\`: ${description}\n`
)}`,
              },
              uniqueItems: true,
              minItems: 1,
              examples: [["reasoning"], ["create_folder"]],
            },
          },
          required: ["description", "actions"],
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 50,
      }),

      forCurrentState: (state: WorkflowState): Schema<{}>["jsonSchema"] => {
        if (!state.isWorkflowInitialized()) {
          return createArgsDef.common({ steps: createArgsDef.steps() }, false);
        }

        const currentStep = state.getCurrentStep();
        if (!currentStep) {
          throw new Error(
            `Invalid workflow state: no current step,${JSON.stringify(
              state.getDebugInfo()
            )}`
          );
        }

        const stepDependencies = {
          ...pick(toolNameToSchema(internalActions), currentStep.actions),
          ...pick(depGroups, currentStep.actions),
        };
        const includeRepeat = state.hasNextStep();

        return createArgsDef.common(stepDependencies, includeRepeat);
      },

      forNextState: (state: WorkflowState): Schema<{}>["jsonSchema"] => {
        if (!state.isWorkflowInitialized() || !state.hasNextStep()) {
          throw new Error(
            `Cannot get next state schema: no next step available`
          );
        }

        const currentStepIndex = state.getCurrentStepIndex();
        const allSteps = state.getSteps();
        const nextStep = allSteps[currentStepIndex + 1];

        if (!nextStep) {
          throw new Error(`Next step not found`);
        }

        const stepDependencies = {
          ...pick(toolNameToSchema(internalActions), nextStep.actions),
          ...pick(depGroups, nextStep.actions),
        };

        const includeRepeat = currentStepIndex + 2 < allSteps.length;

        return createArgsDef.common(stepDependencies, includeRepeat);
      },
    };

    const executor = {
      async execute(args: any, state: WorkflowState): Promise<any> {
        // User intent detection - if steps are provided and workflow is already initialized, reset state
        if (args.steps && state.isWorkflowInitialized()) {
          state.reset();
        }

        // Step back for repeat mode (normal forward flow continues in `executeStep`)
        if (args.repeat) {
          state.moveToPreviousStep();
        }

        const validationSchema = createArgsDef.forCurrentState(state);

        // Parameter validation using the appropriate schema
        const validate = ajv.compile(validationSchema);
        if (!validate(args)) {
          const errors = new AggregateAjvError(validate.errors!);
          return {
            content: [
              {
                type: "text",
                text: `Tool call arguments validation failed: ${errors.message}`,
              },
            ],
            isError: true,
          };
        }

        // Route to specific method based on workflow state
        if (!state.isWorkflowInitialized()) {
          if (!args.steps) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Workflow not initialized. Please provide 'steps' parameter to start a new workflow.",
                },
              ],
              isError: true,
            };
          }
          return await this.initialize(args, state);
        } else {
          return await this.executeStep(args, state, true);
        }
      },

      async initialize(args: any, state: WorkflowState): Promise<any> {
        const steps = args.steps as Array<MCPCStep>;

        if (!steps || steps.length === 0) {
          return {
            content: [{ type: "text", text: "Error: No steps provided" }],
            isError: true,
          };
        }

        if (ENFORE_REASONING) {
          steps.unshift({
            description:
              "Initial reasoning - analyze input and plan approach using available context",
            actions: ["reasoning"],
          });
          steps.push({
            description:
              "Final reasoning - synthesize results and validate against original objectives",
            actions: ["reasoning"],
          });
        }

        state.initialize(steps);

        const firstStepArgsDef = createArgsDef.forCurrentState(state);

        return {
          content: [
            {
              type: "text",
              text: `Workflow initialized with ${
                steps.length
              } steps. You MUST proceed to next step to \`${
                state.getNextStep()?.description
              }\`. **EXECUTE tool \`${name}\` with these arguments - MANDATORY**

${JSON.stringify(firstStepArgsDef, null, 2)}

## Important Instructions
- **Do NOT include 'steps' parameter in any subsequent tool calls**
- **If the current step fails or requires retry, you MUST set \`repeat\` to true to retry it**
- **MUST Use the provided JSON schema definition above for parameter generation and validation**
`,
            },
          ],
          isError: false,
          _meta: { description: "Planning workflows" },
        };
      },

      async executeStep(
        args: any,
        state: WorkflowState,
        shouldContinue: boolean
      ): Promise<any> {
        const currentStep = state.getCurrentStep();
        if (!currentStep) {
          return {
            content: [
              { type: "text", text: "Error: No current step to execute" },
            ],
            isError: true,
          };
        }

        const results: CallToolResult = {
          content: [],
          isError: false,
          _meta: { description: state.getCurrentStep()?.description },
        };

        // Execute all actions in the current step
        for (const action of currentStep.actions) {
          try {
            const currentTool =
              toolNameToDetailList.find(
                ([toolName]: [string]) => toolName === action
              )?.[1] ?? internalActions[action];

            if (!currentTool) {
              throw new Error(`Tool ${action} not found`);
            }

            const actionArgs = args[action] || {};
            const actionResult = await currentTool.execute(actionArgs);

            if (!results.isError) {
              results.isError = actionResult.isError;
            }

            results.content.push({
              type: "text",
              text: `Action ${action} result: ${JSON.stringify(
                actionResult,
                null,
                2
              )}`,
            });
          } catch (error) {
            results.content.push({
              type: "text",
              text: `Action ${action} failed: ${(error as any).message}`,
            });
            results.isError = true;
          }
        }

        if (state.hasNextStep()) {
          const nextStepArgsDef = createArgsDef.forNextState(state);
          results.content.push({
            type: "text",
            text: `You **MUST** decide whether to proceed to the next step to \`${
              state.getNextStep()?.description
            }\`. 
If you choose to continue, **EXECUTE tool \`${name}\` with these arguments - MANDATORY**:

${JSON.stringify(nextStepArgsDef, null, 2)}

**Instructions:**
- Analyze the previous action's result carefully
- Determine if the next step is necessary and appropriate
- If proceeding, ensure all required parameters are properly filled, **Exclude the \`steps\` key from your generated parameters**

If the current step fails or requires retry, you MUST set \`repeat\` to true to retry the current step.`,
          });

          state.moveToNextStep();
        } else {
          // Workflow completed
          state.reset();
          results.content.push({
            type: "text",
            text: `Workflow completed successfully. **If you need to start over or backtrack or retry, you MUST provide 'steps' parameter to start a new workflow.**`,
          });
        }

        return results;
      },
    };

    const workflowState = new WorkflowState();

    const toolDescription = `I am an autonomous agent tool named \`${name}\` that fulfills user requests through a structured multi-step workflow.

**My Instructions:**
\`\`\`txt
${description}
\`\`\`

**How I Work:**

**FIRST CALL (Planning Phase):**
- I analyze the user's request AND the instructions above
- I create a complete workflow plan
- Each step in the array represents one action I'll take
- I MUST include ALL necessary steps to fulfill BOTH the user request AND follow all instructions

**SUBSEQUENT CALLS (Execution Phase):**
- I execute ONE step from my planned workflow
- I generate only the action parameters for the current step
- I DO NOT modify workflows in progress; I regenerate workflow steps ONLY when necessary

**Key Rules:**
1. **Planning**: My first response MUST be a JSON object with a \`steps\` array containing the complete workflow
2. **Execution**: Later responses execute individual steps ONLY
3. **Completeness**: I must address both user needs AND instruction requirements
4. **Consistency**: Once planned, I stick to the workflow unless restart is absolutely necessary
5. **Reasoning**: I use **reasoning actions** when I need to think or plan
`;

    this.tool(
      name,
      toolDescription,
      jsonSchema(
        createGoogleCompatibleJSONSchema(
          createArgsDef.forCurrentState(workflowState) as any
        )
      ),
      async (args: any) => {
        try {
          return await executor.execute(args, workflowState);
        } catch (error) {
          workflowState.reset();
          return {
            content: [
              {
                type: "text",
                text: `Workflow execution error: ${(error as any).message}`,
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  async registerTool({
    description,
    name,
    allToolNames,
    depGroups,
    toolNameToDetailList,
  }: any) {
    description = `Context: This is the autonomous MCP tool \`${name}\`. It fulfills user instructions by orchestrating actions via **iterative self-invocation(\`${name}\`)**.

# User Instructions: ${description}

# Action Execution Protocol

The MCP tool executes actions in a multi-step process. Follow these steps for each iteration:

* Do not treat actions merely as simple tool calls.
* Always execute actions via this protocol. Do NOT attempt direct, unstructured calls.

1.  **Determine Current Action:** Based on user instructions, overall task goal, and prior results, identify the *single most appropriate action* for this step.
2.  **Anticipate Next Action (if any):** Plan and anticipate the likely *next action* needed to complete the task after the current step.

# Available Actions

**WARNING:** ONLY call or execute actions from this list. DO NOT attempt to call or execute actions not explicitly listed here.
${allToolNames.join(", ")}
`;
    const allOf = toolNameToDetailList.map(([toolName]: [string]) => {
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

    const argsDef: Schema<{}>["jsonSchema"] = {
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
            "Specify the next action to execute only when the user’s request requires additional steps. If no next action is needed, this property **MUST BE OMITTED** from the object.",
        },
        ...depGroups,
      },
      required: [ACTION_KEY],
    };

    const validate = ajv.compile(argsDef);

    this.tool(
      name,
      description,
      jsonSchema<any>(createGoogleCompatibleJSONSchema(argsDef as any)),
      async (args) => {
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
          ([name]: [string]) => name === args[ACTION_KEY]
        )?.[1];

        const action = args[ACTION_KEY] as string;
        const nextAction = args[NEXT_ACTION_KEY] as string;
        const currentResult = await currentTool.execute({
          ...args[action],
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
}

/**
 * Registers all tools from the composed MCP dependencies with a server.
 */
export function registerDepTools(
  server: ComposableMCPServer,
  tools: Record<string, any>
): ComposableMCPServer {
  Object.entries(tools).forEach(([name, tool]) => {
    // Register the tool with the server
    server.tool(
      name,
      tool.description ?? "",
      tool.parameters.jsonSchema,
      tool.execute
    );
  });

  return server as ComposableMCPServer;
}
