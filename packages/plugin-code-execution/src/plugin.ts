/**
 * Code Execution Mode Plugin
 *
 * Implements secure code execution using Deno sandbox.
 * Provides progressive disclosure and efficient context usage.
 */

import type { AgentToolRegistrationContext, ToolPlugin } from "@mcpc/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type SandboxConfig, SandboxExecutor } from "./sandbox-executor.ts";
import { jsonSchema } from "@mcpc/core";
import { CODE_EXECUTION_PROMPT, compilePrompt } from "./prompts.ts";

export interface CodeExecutionPluginOptions {
  sandbox?: SandboxConfig;
}

export function createCodeExecutionPlugin(
  options: CodeExecutionPluginOptions = {},
): ToolPlugin {
  let executor: SandboxExecutor | null = null;

  return {
    name: "code_execution",
    version: "1.0.0",
    apply: "custom",

    registerAgentTool: (context: AgentToolRegistrationContext) => {
      const { server, name, description, allToolNames } = context;

      // Start sandbox executor
      executor = new SandboxExecutor(
        options.sandbox || {},
        (toolName, params) =>
          server.callTool(toolName, params) as Promise<CallToolResult>,
      );
      executor.start();

      // Build tool schema
      const toolItems = allToolNames.length > 0
        ? { type: "string", enum: allToolNames }
        : { type: "string" };

      const schema = {
        type: "object",
        properties: {
          code: {
            type: "string",
            description:
              "JavaScript to run. You can use callMCPTool(toolName, params) and console.log(). Before calling a tool, request its schema with definitionsOf, then use it in your code.",
          },
          definitionsOf: {
            type: "array",
            items: toolItems,
            default: [],
            description:
              "Tool names whose schemas you need. The agent uses these to understand available tools before calling them.",
          },
          hasDefinitions: {
            type: "array",
            items: toolItems,
            description:
              "Tool names whose schemas were already provided in this conversation. List all tools you have schemas for to avoid duplicate schema requests",
          },
        },
      } as const;

      // Register tool with enhanced description
      server.tool(
        name,
        compilePrompt(CODE_EXECUTION_PROMPT, { toolName: name, description }),
        jsonSchema<Record<string, unknown>>(schema as Record<string, unknown>),
        async (args: Record<string, unknown>): Promise<CallToolResult> => {
          const code = args.code as string | undefined;
          const definitionsOf = (args.definitionsOf as string[]) || [];
          const hasDefinitions = (args.hasDefinitions as string[]) || [];
          const contentParts: CallToolResult["content"] = [];

          // Execute code
          if (code && hasDefinitions.length > 0) {
            if (!executor) throw new Error("Sandbox not initialized");

            const result = await executor.executeCode(code, hasDefinitions);
            if (result.content) {
              contentParts.push(...result.content);
            }
          }

          // Provide tool definitions
          const needsDefinitions = definitionsOf.filter(
            (def) => !hasDefinitions.includes(def),
          );

          if (needsDefinitions.length > 0) {
            const definitionTexts: string[] = [];

            for (const toolName of needsDefinitions) {
              const toolDetail = context.toolNameToDetailList.find(
                ([name]) => name === toolName,
              );

              if (toolDetail) {
                const [name, schema] = toolDetail;
                const schemaJson = JSON.stringify(schema, null, 2);
                definitionTexts.push(
                  `<tool name="${name}">\n${schemaJson}\n</tool>`,
                );
              }
            }

            if (definitionTexts.length > 0) {
              contentParts.push({
                type: "text",
                text: definitionTexts.join("\n\n"),
              });
            }
          }

          const text = contentParts.map((p) => p.text).join("\n") ||
            "No output generated, use console.log() to log output";

          return { content: [{ type: "text", text }] };
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
