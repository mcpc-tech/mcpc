/**
 * MCPC Prompt Management System
 *
 * Centralized management for all prompts and templates used across MCPC.
 * Supports dynamic content replacement and template variables.
 *
 * @see https://docs.claude.com/en/docs/agents-and-tools/tool-use/implement-tool-use#best-practices-for-tool-definitions for guidelines on tool design.
 */

import { p } from "@mcpc/utils";

export const SystemPrompts = {
  /**
   * Base system prompt for autonomous MCP execution
   *
   * Uses simplified Unix-style interface:
   * - `tool` + `args` for clean, consistent structure
   * - `man` command for fetching tool schemas (like Unix manual)
   * - No `hasDefinitions` - trusts model's context memory
   */
  AUTONOMOUS_EXECUTION:
    `Agentic tool \`{toolName}\` that executes complex tasks by iteratively selecting and calling tools.

You must follow the <manual/>, obey the <rules/>, and use the <format/>.

<manual>
{description}
</manual>

<parameters>
\`tool\` - Which tool to execute: "man" to get schemas, or a tool name to execute
\`args\` - For "man": { tools: ["tool1", "tool2"] }. For other tools: tool parameters that strictly adhere to the tool's JSON schema.
</parameters>

<rules>
1. **First call**: Use \`man\` to get tool schemas you need
2. **Execute tools**: Use tool name in \`tool\` and parameters in \`args\`
3. **Parallel calls**: If your client supports it, call \`man\` and execute tools simultaneously
4. Note: You are an agent exposed as an MCP tool
</rules>

<format>
Get tool schemas:
\`\`\`json
{
  "tool": "man",
  "args": { "tools": ["tool1", "tool2"] }
}
\`\`\`

Execute a tool:
\`\`\`json
{
  "tool": "tool_name",
  "args": { /* tool parameters */ }
}
\`\`\`
</format>`,

  /**
   * Compact system prompt for autonomous MCP execution (when manual is provided)
   *
   * Uses simplified description with progressive disclosure:
   * - Short description shown by default
   * - Use `man { manual: true }` to get full manual
   */
  AUTONOMOUS_EXECUTION_COMPACT: `Agentic tool \`{toolName}\`: {description}

Use \`man\` with \`{ tools: [], manual: true }\` to get the full manual, or \`{ tools: ["tool1"] }\` to get tool schemas.

<format>
Get full manual: \`{ "tool": "man", "args": { "tools": [], "manual": true } }\`
Get tool schemas: \`{ "tool": "man", "args": { "tools": ["tool1", "tool2"] } }\`
Get tool schemas + manual: \`{ "tool": "man", "args": { "tools": ["tool1"], "manual": true } }\`
Execute a tool: \`{ "tool": "tool_name", "args": { /* parameters */ } }\`
</format>`,

  /**
   * Tool description for sampling tools (shown in MCP tools list)
   * Explains how to use prompt and context parameters
   */
  SAMPLING_TOOL_DESCRIPTION:
    `Subagent tool \`{toolName}\` that executes complex tasks.

You must follow the <manual/>, obey the <rules/>, and use the <format/>.

<manual>
{description}
</manual>

<format>
\`prompt\` - The task to be completed (e.g., "organize my desktop files")
\`context\` - Execution context object (e.g., { cwd: "/path/to/dir" })
</format>

<rules>
1. Always provide both \`prompt\` and \`context\` parameters
2. \`prompt\` must be a clear, actionable description
3. \`context\` must include relevant environment info (e.g., working directory)
</rules>`,

  /**
   * System prompt for AI sampling loop (ai_sampling/ai_acp modes)
   * Used inside the execution loop when AI calls native tools.
   * Note: Tool schemas are passed via AI SDK native tool calling, not in prompt.
   */
  AI_LOOP_SYSTEM: `Agent \`{toolName}\` that completes tasks by calling tools.

<manual>
{description}
</manual>

<rules>
{rules}
</rules>{context}`,
};

/**
 * Response templates for different scenarios
 */
export const ResponseTemplates = {
  /**
   * Success response for action execution
   */
  ACTION_SUCCESS: `Action \`{currentAction}\` completed.

Next: Execute \`{nextAction}\` by calling \`{toolName}\` again.`,

  /**
   * Planning prompt when no next action is specified
   */
  PLANNING_PROMPT: `Action \`{currentAction}\` completed. Determine next step:

1. Analyze results from \`{currentAction}\`
2. Decide: Continue with another action or Complete?
3. Call \`{toolName}\` with chosen action or \`decision: "complete"\``,

  /**
   * Error response templates
   */
  ERROR_RESPONSE: `Validation failed: {errorMessage}

Adjust parameters and retry.`,

  /**
   * Completion message
   */
  COMPLETION_MESSAGE: `Task completed.`,

  /**
   * Security validation messages
   */
  SECURITY_VALIDATION: {
    PASSED: `Security check passed: {operation} on {path}`,
    FAILED: `Security check failed: {operation} on {path}`,
  },

  /**
   * Audit log messages
   */
  AUDIT_LOG: `[{timestamp}] {level}: {action} on {resource}{userInfo}`,
};

/**
 * Tool description templates and enhancements
 */
export const ToolDescriptions = {
  /**
   * Base template for tool descriptions
   */
  BASE_TEMPLATE: `{description}

Tools: {availableTools}
Capabilities: {capabilities}
Standards: {qualityStandards}`,
};

/**
 * Pre-compiled prompt templates with type safety
 */
export const CompiledPrompts = {
  autonomousExecution: p(SystemPrompts.AUTONOMOUS_EXECUTION),
  autonomousExecutionCompact: p(SystemPrompts.AUTONOMOUS_EXECUTION_COMPACT),
  samplingToolDescription: p(SystemPrompts.SAMPLING_TOOL_DESCRIPTION),
  aiLoopSystem: p(SystemPrompts.AI_LOOP_SYSTEM),
  actionSuccess: p(ResponseTemplates.ACTION_SUCCESS),
  planningPrompt: p(ResponseTemplates.PLANNING_PROMPT),
  errorResponse: p(ResponseTemplates.ERROR_RESPONSE),
  securityPassed: p(ResponseTemplates.SECURITY_VALIDATION.PASSED),
  securityFailed: p(ResponseTemplates.SECURITY_VALIDATION.FAILED),
  auditLog: p(ResponseTemplates.AUDIT_LOG),
  completionMessage: () => ResponseTemplates.COMPLETION_MESSAGE,
};

/**
 * Utility functions for prompt management
 */
export const PromptUtils = {
  /**
   * Generate tool list for descriptions
   */
  generateToolList: (
    tools: Array<{ name: string; description?: string; hide?: boolean }>,
  ) => {
    return tools
      .filter((tool) => !tool.hide)
      .map(
        (tool) =>
          `<tool name="${tool.name}"${
            tool.description ? ` description="${tool.description}"` : ""
          }/>`,
      )
      .join("\n");
  },

  /**
   * Generate hidden tool list for descriptions
   */
  generateHiddenToolList: (tools: Array<{ name: string; hide?: boolean }>) => {
    return tools
      .filter((tool) => tool.hide)
      .map((tool) => `<tool name="${tool.name}" hide/>`)
      .join("\n");
  },

  /**
   * Generate user info for audit logs
   */
  formatUserInfo: (user?: string) => {
    return user ? ` by ${user}` : "";
  },

  /**
   * Format timestamp for logs
   */
  formatTimestamp: () => {
    return new Date().toISOString();
  },
};

/**
 * Export all prompt-related utilities
 */
export * from "./types.ts";
