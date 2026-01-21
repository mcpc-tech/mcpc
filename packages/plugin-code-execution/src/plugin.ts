/**
 * Code Execution Mode Plugin
 *
 * Implements secure code execution using Deno sandbox.
 * Uses Unix-style `man` command pattern from core for consistency.
 */

import type { AgentToolRegistrationContext, ToolPlugin } from "@mcpc/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type SandboxConfig, SandboxExecutor } from "./sandbox-executor.ts";
import { jsonSchema } from "@mcpc/core";
import { compilePrompt } from "./prompts.ts";

export interface CodeExecutionPluginOptions {
  sandbox?: SandboxConfig;
}

export function createCodeExecutionPlugin(
  options: CodeExecutionPluginOptions = {},
): ToolPlugin {
  let executor: SandboxExecutor | null = null;

  return {
    name: "code_execution",
    version: "2.0.0",
    apply: "code_execution",

    registerAgentTool: (context: AgentToolRegistrationContext) => {
      const { server, name, description, allToolNames, toolNameToDetailList } =
        context;

      // Start sandbox executor
      executor = new SandboxExecutor(
        options.sandbox || {},
        (toolName, params) =>
          server.callTool(toolName, params) as Promise<CallToolResult>,
      );
      executor.start();

      // Unix-style schema: tool + args (same as core agentic mode)
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

      // Register tool
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

          // Handle `man` command - return tool schemas
          if (tool === "man") {
            const requestedTools = (toolArgs.tools as string[]) || [];
            if (requestedTools.length === 0) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Available tools: ${allToolNames.join(", ") || "none"}`,
                  },
                ],
              };
            }

            const schemas = requestedTools
              .map((toolName) => {
                const toolDetail = toolNameToDetailList.find(
                  ([n]) => n === toolName,
                );
                if (toolDetail) {
                  const [n, s] = toolDetail;
                  return `<tool_definition name="${n}">\n${JSON.stringify(s, null, 2)}\n</tool_definition>`;
                }
                return null;
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

          // Handle `exec` command - execute JavaScript code
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

            if (!executor) throw new Error("Sandbox not initialized");
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

// Export default instance
const plugin: ToolPlugin = createCodeExecutionPlugin();
export default plugin;
