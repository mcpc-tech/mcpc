import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
  Implementation,
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
import { optionalObject } from "././utils/common/json.ts";
import { composeMcpDepTools, parseTags } from "../mod.ts";
import { ComposeDefination } from "./set-up-mcp-compose.ts";
import { pick } from "@es-toolkit/es-toolkit";
import { join } from "node:path";

const TOOLS_PLACEHOLDER = "__ALL__";

const NEXT_ACTION_KEY = "nextAction";
const ACTION_KEY = "action";

const GEMINI_PREFERRED_FORMAT =
  process.env.GEMINI_PREFERRED_FORMAT === "0" ? false : true;

const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});
// @ts-ignore -
addFormats(ajv);

type MCPCStep = {
  description: string;
  actions: Array<string>;
};

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
    // Provider restriction: did not support additionalProperties
    // see -> https://ai.google.dev/api/caching#Schema
    const optionalAdditionalProperties = optionalObject(
      { additionalProperties: false },
      !GEMINI_PREFERRED_FORMAT
    );

    const allOf = toolNameToDetailList.map(([toolName]) => {
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

    // Provider restriction: tools.0.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf at the top level"
    const optionalAllOf = optionalObject({ allOf }, !GEMINI_PREFERRED_FORMAT);

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
            ...optionalAdditionalProperties,
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
          optionalAdditionalProperties,
          optionalAllOf,
          depGroups,
          toolNameToDetailList,
        });
        return;
      case "agentic_workflow":
        await this.registerAgenticWorkflowTool({
          description,
          name,
          allToolNames,
          optionalAdditionalProperties,
          optionalAllOf,
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
    optionalAdditionalProperties,
    optionalAllOf,
    depGroups,
    toolNameToDetailList,
  }: any) {
    class WorkflowState {
      private currentStepIndex: number = -1;
      private steps: Array<MCPCStep> = [];
      private isInitialized: boolean = false;

      getCurrentStepIndex(): number {
        return this.currentStepIndex;
      }

      getSteps(): Array<MCPCStep> {
        return this.steps;
      }

      isWorkflowInitialized(): boolean {
        return this.isInitialized;
      }

      getCurrentStep(): MCPCStep | null {
        if (!this.isInitialized || this.currentStepIndex < 0) {
          return null;
        }
        return this.steps[this.currentStepIndex] || null;
      }

      getNextStep(): MCPCStep | null {
        if (!this.isInitialized) return null;
        const nextIndex = this.currentStepIndex + 1;
        return this.steps[nextIndex] || null;
      }

      hasNextStep(): boolean {
        return this.getNextStep() !== null;
      }

      isCompleted(): boolean {
        return (
          this.isInitialized && this.currentStepIndex >= this.steps.length - 1
        );
      }

      initialize(steps: Array<MCPCStep>): void {
        this.steps = steps;
        this.currentStepIndex = 0;
        this.isInitialized = true;
      }

      moveToNextStep(): boolean {
        if (!this.hasNextStep()) {
          return false;
        }
        this.currentStepIndex++;
        return true;
      }

      reset(): void {
        this.currentStepIndex = -1;
        this.steps = [];
        this.isInitialized = false;
      }

      getDebugInfo(): any {
        return {
          currentStepIndex: this.currentStepIndex,
          totalSteps: this.steps.length,
          isInitialized: this.isInitialized,
          currentStep: this.getCurrentStep()?.description,
          nextStep: this.getNextStep()?.description,
        };
      }
    }

    const createArgsDef = {
      common: (
        extra: { [n: string]: Schema<{}>["jsonSchema"] },
        includeGoon: boolean
      ): Schema<{}>["jsonSchema"] => ({
        type: "object",
        description: `Object structured according to the current or next tool's JSON Schema argument definition`,
        properties: {
          ...(includeGoon
            ? {
                goon: {
                  type: "boolean",
                  title: "Continue to Next Step",
                  description:
                    "Controls step execution flow. Set to true to proceed to the next step, set to false to repeat the current step",
                },
              }
            : {}),
          ...extra,
        },
        required: Object.keys(extra)
          .filter((n) => n !== "steps")
          .concat(includeGoon ? ["goon"] : []),
        additionalProperties: true,
      }),

      steps: (): Schema<{}>["jsonSchema"] => ({
        type: "array",
        title: "Steps Definition",
        description: `
An array of step objects that define a sequence of COMPLETE actions as part of a workflow to be executed to fulfill the user's request.

CRITICAL:
-   Steps should be organized to reflect the workflow, where each step represents a distinct phase of the process.
-   Actions within a single step execute concurrently. If actions have dependencies or must run in sequence, they MUST be placed in separate steps.
-   Leave actions empty [] if this step is purely organizational/planning.

Common Workflow Patterns Requiring Separate Steps:
-   File Operations:
  - Step 1: List files
  - Step 2: Create files
  - Step 3: Move files
  - Step 4: Cleanup

-   Database Operations:
  - Step 1: Connect to database
  - Step 2: Create schema
  - Step 3: Insert data
  - Step 4: Query database

-   API Operations:
  - Step 1: Authenticate
  - Step 2: Make API calls
  - Step 3: Process responses

-   Network Operations:
  - Step 1: Establish connection
  - Step 2: Send request
  - Step 3: Handle response

Focus on defining clear steps in the workflow to ensure efficient execution and management of dependencies.
`,
        items: {
          type: "object",
          title: "Step Object",
          description: `
          A single step containing actions that execute concurrently.
          All actions in this step run simultaneously with no guaranteed order.
        `,
          properties: {
            description: {
              type: "string",
              title: "Step Description",
              description:
                "A human-readable description of what this step accomplishes",
              examples: [
                "List files in the source directory",
                "Create necessary target directories",
                "Move files to their respective folders",
                "Validate input and initialize logging",
              ],
            },
            actions: {
              type: "array",
              title: "Concurrent Actions",
              description: `
Array of action names that execute concurrently in this step.

WARNING: These actions MUST be independent with no dependencies.
If Action A must complete before Action B, put them in separate steps.

IMPORTANT: Use DIFFERENT actions across steps - avoid repeating the same action.
Each step should serve a distinct purpose requiring different tools.
`,
              items: {
                type: "string",
                enum: allToolNames,
                description: "Individual action name from available actions",
              },
              uniqueItems: true,
              examples: [
                ["list_directory"],
                ["create_folder_a", "create_folder_b"],
                ["validate_input"],
              ],
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
          throw new Error(`Invalid workflow state: no current step`);
        }

        const stepDependencies = pick(depGroups, currentStep.actions);
        const includeGoon = state.hasNextStep();

        return createArgsDef.common(stepDependencies, includeGoon);
      },
    };

    const executor = {
      async initialize(args: any, state: WorkflowState): Promise<any> {
        const steps = args.steps as Array<MCPCStep>;

        if (!steps || steps.length === 0) {
          return {
            content: [{ type: "text", text: "Error: No steps provided" }],
            isError: true,
          };
        }

        state.initialize(steps);

        const firstStepArgsDef = createArgsDef.forCurrentState(state);

        return {
          content: [
            {
              type: "text",
              text: `Workflow initialized with ${steps.length} steps.

## Next Step's Tool Arguments JSON Schema Definition
${JSON.stringify(firstStepArgsDef, null, 2)}

## Next Step's Purpose
${state.getNextStep()?.description}
`,
            },
          ],
          isError: false,
        };
      },

      async executeStep(args: any, state: WorkflowState): Promise<any> {
        const currentStep = state.getCurrentStep();
        if (!currentStep) {
          return {
            content: [
              { type: "text", text: "Error: No current step to execute" },
            ],
            isError: true,
          };
        }

        const results = {
          content: [] as Array<{ type: string; text: string }>,
          isError: false,
        };

        for (const action of currentStep.actions) {
          try {
            const currentTool = toolNameToDetailList.find(
              ([toolName]: [string]) => toolName === action
            )?.[1];

            if (!currentTool) {
              throw new Error(`Tool ${action} not found`);
            }

            const actionArgs = args[action] || {};
            const actionResult = await currentTool.execute(actionArgs);

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

        const shouldContinue = args.goon !== false;

        if (shouldContinue && state.hasNextStep()) {
          state.moveToNextStep();

          const nextStepArgsDef = createArgsDef.forCurrentState(state);
          results.content.push({
            type: "text",
            text: `Based on the above action result, you **MUST** decide whether to proceed to the next step. If you choose to continue, set "goon" to true and provide the required arguments as follows:

# Next Step's Tool Arguments JSON Schema Definition
${JSON.stringify(nextStepArgsDef, null, 2)}
# Next Step's Purpose
${state.getNextStep()?.description}

**Instructions:**
- Analyze the previous action's result carefully
- Determine if the next step is necessary and appropriate
- If proceeding, ensure all required parameters are properly filled
- If not proceeding, set "goon" to false and provide a clear reason`,
          });
        } else if (state.isCompleted() || !state.hasNextStep()) {
          state.reset();
          results.content.push({
            type: "text",
            text: "**Workflow completed successfully**. All steps have been executed.",
          });
        } else {
          results.content.push({
            type: "text",
            text: "Workflow paused. Set 'goon' to true to continue to the next step.",
          });
        }

        return results;
      },
    };

    const workflowState = new WorkflowState();

    const toolDescription = `An autonomous MCP tool named \`${name}\` that fulfills user instructions through **iterative self-invocation(\`${name}\`)**. Each call represents one step in a multi-step workflow.
**User Instructions**: ${description}

**Workflow Requirements**: 
- Generate a **COMPLETE** multi-step workflow based on user instructions
- You MUST NOT generate \`steps\` key when calling next step
`;

    this.tool(
      name,
      toolDescription,
      jsonSchema(createArgsDef.forCurrentState(workflowState) as any),
      async (args: any) => {
        try {
          const currentArgsDef = createArgsDef.forCurrentState(workflowState);
          const validate = ajv.compile(currentArgsDef);
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

          if (!workflowState.isWorkflowInitialized()) {
            return await executor.initialize(args, workflowState);
          } else {
            return await executor.executeStep(args, workflowState);
          }
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
    optionalAdditionalProperties,
    optionalAllOf,
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

    const argsDef: Schema<{}>["jsonSchema"] = {
      ...optionalAdditionalProperties,
      ...optionalAllOf,
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

    this.tool(name, description, jsonSchema<any>(argsDef), async (args) => {
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
    });
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
