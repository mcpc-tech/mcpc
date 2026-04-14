import type { AgentToolRegistrationContext, ToolPlugin } from "@mcpc/core";
import { jsonSchema } from "@mcpc/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  type SandboxConfig,
  SandboxExecutor,
} from "@mcpc/plugin-code-execution/sandbox";
import type { MCPSamplingProviderOptions } from "@mcpc/mcp-sampling-ai-provider";
import { compilePrompt } from "./prompts.ts";
import { createSandboxSamplingHandler } from "./sandbox-sampling.ts";

export const CODE_EXECUTION_SAMPLING_MODE = "code_execution_sampling";

export interface CodeExecutionSamplingPluginOptions {
  sandbox?: SandboxConfig;
  sampling?: {
    maxSteps?: number;
    maxTokens?: number;
    modelPreferences?: MCPSamplingProviderOptions["modelPreferences"];
  };
}

export function createCodeExecutionSamplingPlugin(
  options: CodeExecutionSamplingPluginOptions = {},
): ToolPlugin {
  let executor: SandboxExecutor | null = null;

  return {
    name: "code_execution_sampling",
    version: "1.0.0",
    apply: CODE_EXECUTION_SAMPLING_MODE,

    registerAgentTool: (context: AgentToolRegistrationContext) => {
      const { server, name, description, allToolNames, toolNameToDetailList } =
        context;

      executor = new SandboxExecutor(
        options.sandbox || {},
        (toolName, params) =>
          server.callTool(toolName, params) as Promise<CallToolResult>,
      );

      const samplingHandler = createSandboxSamplingHandler({
        server,
        maxSteps: options.sampling?.maxSteps,
        maxTokens: options.sampling?.maxTokens,
        modelPreferences: options.sampling?.modelPreferences,
      });
      executor.registerHandler(
        "sampling",
        async (...args: unknown[]) => {
          return await samplingHandler(args[0], args[1]);
        },
      );
      executor.start();

      const toolEnum = ["man", "exec"];
      const schema = {
        type: "object",
        properties: {
          tool: {
            type: "string",
            enum: toolEnum,
            description:
              'Use "man" to get tool schemas, "exec" to execute JavaScript code.',
          },
          args: {
            type: "object",
            description:
              'For "man": { tools: ["tool1", "tool2"] }. For "exec": { code: "..." }.',
          },
        },
        required: ["tool"],
      } as const;

      server.tool(
        name,
        compilePrompt({
          toolName: name,
          description,
          availableTools: allToolNames.join(", ") || "none",
        }),
        jsonSchema<Record<string, unknown>>(schema as Record<string, unknown>),
        async (args: Record<string, unknown>): Promise<CallToolResult> => {
          const tool = args.tool as string;
          const toolArgs = (args.args as Record<string, unknown>) || {};

          if (tool === "man") {
            const requestedTools = (toolArgs.tools as string[]) || [];
            if (requestedTools.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Available tools: ${
                      allToolNames.join(", ") || "none"
                    }`,
                  },
                ],
              };
            }

            const schemaMap = new Map(toolNameToDetailList);
            const schemas = requestedTools
              .map((toolName) => {
                const detail = schemaMap.get(toolName);
                if (!detail) return null;
                return `<tool_definition name="${toolName}">\n${
                  JSON.stringify(detail, null, 2)
                }\n</tool_definition>`;
              })
              .filter(Boolean);

            return {
              content: [
                {
                  type: "text",
                  text: schemas.length > 0
                    ? schemas.join("\n\n")
                    : "No schemas found for requested tools.",
                },
              ],
            };
          }

          if (tool === "exec") {
            const code = toolArgs.code as string | undefined;
            if (!code) {
              return {
                content: [
                  { type: "text", text: 'Missing "code" in args for "exec".' },
                ],
                isError: true,
              };
            }

            if (!executor) {
              throw new Error("Sandbox not initialized");
            }
            return await executor.executeCode(code);
          }

          return {
            content: [
              {
                type: "text",
                text: `Unknown tool "${tool}". Use "man" or "exec".`,
              },
            ],
            isError: true,
          };
        },
      );
    },

    dispose: () => {
      if (executor) {
        executor.stop();
        executor = null;
      }
    },
  };
}

const plugin: ToolPlugin = createCodeExecutionSamplingPlugin();
export default plugin;
