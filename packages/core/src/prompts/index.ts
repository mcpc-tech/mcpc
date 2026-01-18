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
\`args\` - For "man": array of tool names. For other tools: object with parameters.
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
  "args": ["tool1", "tool2"]
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
   * Workflow execution system prompt
   */
  WORKFLOW_EXECUTION:
    `Workflow tool \`{toolName}\` that executes multi-step workflows. Use this when your task requires sequential steps.

<manual>
{description}
</manual>

<rules>
1. First call: {planningInstructions}
2. Subsequent calls: Provide only current step parameters
3. Use \`decision: "proceed"\` to advance, \`"retry"\` to retry, \`"complete"\` when done
4. Include \`steps\` ONLY with \`init: true\`, never during execution
</rules>`,

  /**
   * Tool-based execution system prompt for autonomous sampling mode with native tools
   *
   * Note: Used when client supports sampling.tools capability
   */
  SAMPLING_EXECUTION_TOOLS:
    `Agent \`{toolName}\` that completes tasks by calling tools.

<manual>
{description}
</manual>

<rules>
1. Execute one action per iteration
2. Adapt based on results from previous actions
3. Continue until task is complete
</rules>

<tools>
{toolList}
</tools>`,

  /**
   * JSON-only execution system prompt for autonomous sampling mode
   *
   * Note: Sampling mode runs an internal LLM loop that autonomously calls tools until complete.
   */
  SAMPLING_EXECUTION:
    `Agent \`{toolName}\` that completes tasks by calling tools in an autonomous loop.

<manual>
{description}
</manual>

<rules>
1. **YOUR ENTIRE RESPONSE MUST BE A SINGLE JSON OBJECT** - no text before or after
2. Execute one tool per iteration  
3. Specify which tool to use with \`useTool\`
4. Adapt based on results from previous actions
5. Continue until task is complete
</rules>

<format>
CORRECT:
\`\`\`json
{"useTool": "tool_name", "decision": "proceed", "tool_name": {...}}
\`\`\`

WRONG - No explanations:
\`\`\`
I will list the directory
{"useTool": "list_directory", ...}
\`\`\`

During execution:
\`\`\`json
{
  "useTool": "tool_name",
  "decision": "proceed",
  "tool_name": { /* tool parameters */ }
}
\`\`\`

When complete:
\`\`\`json
{ "decision": "complete" }
\`\`\`

Decisions:
- \`proceed\` = action succeeded, continue
- \`retry\` = action failed, try again  
- \`complete\` = task finished
</format>

<tools>
{toolList}
</tools>`,

  /**
   * Tool description for sampling tools (shown in MCP tools list)
   * Explains how to use userRequest and context parameters
   */
  SAMPLING_TOOL_DESCRIPTION:
    `Subagent tool \`{toolName}\`  that executes complex tasks.

<manual>
{description}
</manual>

<rules>
Call this tool with:
- **userRequest**: The task you want completed (e.g., "organize my desktop files", "create a project structure")
- **context**: Relevant information needed for the task (e.g., working directory, file paths, preferences)
</rules>`,

  /**
   * Tool-based workflow execution system prompt for sampling mode with native tools
   *
   * Note: Used when client supports sampling.tools capability
   */
  SAMPLING_WORKFLOW_EXECUTION_TOOLS:
    `Workflow agent \`{toolName}\` that executes multi-step workflows.

<manual>
{description}
</manual>

<rules>
1. First iteration: Plan workflow and initialize
2. Subsequent iterations: Execute current step
3. Adapt based on step results
4. Continue until all steps complete
</rules>`,

  /**
   * Sampling workflow execution system prompt combining sampling with workflow capabilities
   *
   * Note: Sampling mode runs an internal LLM loop that autonomously executes workflows.
   */
  SAMPLING_WORKFLOW_EXECUTION:
    `Workflow agent \`{toolName}\` that executes multi-step workflows autonomously.

<manual>
{description}
</manual>

<rules>
1. Return valid JSON only
2. First iteration: Plan workflow and initialize with \`init: true\`
3. Subsequent iterations: Execute current step
4. Adapt based on step results
5. Continue until all steps complete
</rules>

<format>
Initialize workflow (first iteration):
\`\`\`json
{
  "action": "{toolName}",
  "init": true,
  "steps": [/* workflow steps */]
}
\`\`\`

Execute step (subsequent iterations):
\`\`\`json
{
  "action": "{toolName}",
  "decision": "proceed|retry",
  /* step parameters */
}
\`\`\`

Complete workflow (omit action):
\`\`\`json
{ "decision": "complete" }
\`\`\`

Decisions:
- \`proceed\` = step succeeded, next step
- \`retry\` = step failed, retry current
- \`complete\` = workflow finished

Rules:
- Include \`steps\` ONLY with \`init: true\`
- Omit \`steps\` during step execution
- Use \`decision: "retry"\` for failed steps
</format>`,
};

/**
 * Workflow-specific prompts and instructions
 */
export const WorkflowPrompts = {
  /**
   * Workflow initialization instructions
   */
  WORKFLOW_INIT:
    `Workflow initialized with {stepCount} steps. Execute step 1: \`{currentStepDescription}\`

Schema: {schemaDefinition}

Call \`{toolName}\` with:
- Parameters matching schema above
- \`decision: "proceed"\` to advance, \`"retry"\` to retry, \`"complete"\` when done
- Omit \`steps\` (only used with \`init: true\`)

{workflowSteps}`,

  /**
   * Tool description enhancement for workflow mode
   */
  WORKFLOW_TOOL_DESCRIPTION: `{description}
{initTitle}
{ensureStepActions}
{schemaDefinition}`,

  /**
   * Planning instructions for predefined workflows
   */
  PREDEFINED_WORKFLOW_PLANNING: `- Set \`init: true\` (steps are predefined)`,

  /**
   * Planning instructions for dynamic workflows
   */
  DYNAMIC_WORKFLOW_PLANNING:
    `- Set \`init: true\` and define complete \`steps\` array`,

  /**
   * Next step decision prompt
   */
  NEXT_STEP_DECISION: `Previous step completed.

Choose action:
- RETRY: Call \`{toolName}\` with \`decision: "retry"\`
- PROCEED: Call \`{toolName}\` with \`decision: "proceed"\` and parameters below

Next: \`{nextStepDescription}\`
{nextStepSchema}

(Omit \`steps\` parameter)`,

  /**
   * Final step completion prompt
   */
  FINAL_STEP_COMPLETION: `Final step executed {statusIcon} - {statusText}

Choose:
- RETRY: \`decision: "retry"\`
- COMPLETE: \`decision: "complete"\`
- NEW: \`init: true\`{newWorkflowInstructions}`,

  /**
   * Workflow completion success message
   */
  WORKFLOW_COMPLETED: `Workflow completed ({totalSteps} steps)

Start new workflow: \`{toolName}\` with \`init: true\`{newWorkflowInstructions}`,

  /**
   * Error messages
   */
  ERRORS: {
    NOT_INITIALIZED: {
      WITH_PREDEFINED:
        "Error: Workflow not initialized. Please provide 'init' parameter to start a new workflow.",
      WITHOUT_PREDEFINED:
        "Error: Workflow not initialized. Please provide 'init' and 'steps' parameter to start a new workflow.",
    },
    ALREADY_AT_FINAL: "Error: Cannot proceed, already at the final step.",
    CANNOT_COMPLETE_NOT_AT_FINAL:
      "Error: Cannot complete workflow - you are not at the final step. Please use decision=proceed to continue to the next step.",
    NO_STEPS_PROVIDED: "Error: No steps provided",
    NO_CURRENT_STEP: "Error: No current step to execute",
  },
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

  WORKFLOW_ERROR_RESPONSE: `Step failed: {errorMessage}

Fix parameters and call with \`decision: "retry"\``,

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
  workflowExecution: p(SystemPrompts.WORKFLOW_EXECUTION),
  samplingExecution: p(SystemPrompts.SAMPLING_EXECUTION),
  samplingExecutionTools: p(SystemPrompts.SAMPLING_EXECUTION_TOOLS),
  samplingToolDescription: p(SystemPrompts.SAMPLING_TOOL_DESCRIPTION),
  samplingWorkflowExecution: p(SystemPrompts.SAMPLING_WORKFLOW_EXECUTION),
  samplingWorkflowExecutionTools: p(
    SystemPrompts.SAMPLING_WORKFLOW_EXECUTION_TOOLS,
  ),
  workflowInit: p(WorkflowPrompts.WORKFLOW_INIT),
  workflowToolDescription: p(WorkflowPrompts.WORKFLOW_TOOL_DESCRIPTION),
  nextStepDecision: p(WorkflowPrompts.NEXT_STEP_DECISION),
  finalStepCompletion: p(WorkflowPrompts.FINAL_STEP_COMPLETION),
  workflowCompleted: p(WorkflowPrompts.WORKFLOW_COMPLETED),
  actionSuccess: p(ResponseTemplates.ACTION_SUCCESS),
  planningPrompt: p(ResponseTemplates.PLANNING_PROMPT),
  errorResponse: p(ResponseTemplates.ERROR_RESPONSE),
  workflowErrorResponse: p(ResponseTemplates.WORKFLOW_ERROR_RESPONSE),
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
   * Format workflow steps for display
   */
  formatWorkflowSteps: (
    steps: Array<{ description: string; actions: string[] }>,
  ) => {
    if (!steps.length) return "";
    return `## Workflow Steps\n${JSON.stringify(steps, null, 2)}`;
  },

  /**
   * Format workflow progress display with status icons
   */
  formatWorkflowProgress: (progressData: {
    steps: Array<{ description: string; actions: string[] }>;
    statuses: Array<string>;
    currentStepIndex: number;
  }) => {
    const statusIcons = {
      pending: "[PENDING]",
      running: "[RUNNING]",
      completed: "[DONE]",
      failed: "[FAILED]",
    };

    return progressData.steps
      .map((step, index) => {
        const status = progressData.statuses[index] || "pending";
        const icon = statusIcons[status as keyof typeof statusIcons] ||
          "[PENDING]";
        const current = index === progressData.currentStepIndex
          ? " **[CURRENT]**"
          : "";
        const actions = step.actions.length > 0
          ? ` | Action: ${step.actions.join(", ")}`
          : "";
        return `${icon} **Step ${
          index + 1
        }:** ${step.description}${actions}${current}`;
      })
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
