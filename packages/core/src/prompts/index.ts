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
   */
  AUTONOMOUS_EXECUTION:
    `Agentic tool \`{toolName}\` that executes complex tasks by iteratively calling actions, gathering results, and deciding next steps until completion. Use this tool when the task matches the manual below.

You must follow the <manual/>, obey the <execution_rules/>, and use the <call_format/>.

<manual>
{description}
</manual>

<execution_rules>
1. **Execute** one action per call
2. **Collect** feedback from each action result
3. **Decide** next step based on feedback:
   - **proceed**: More work needed
   - **complete**: Task finished (omit action field)
   - **retry**: Current action failed
4. **Provide** parameters matching the action name
5. **Continue** until task is complete
6. Note: You are an agent exposed as an MCP tool - **"action" is an internal parameter, NOT an external MCP tool you can call**
</execution_rules>

<call_format>
\`\`\`json
{
  "action": "action_name",
  "decision": "proceed|retry", 
  "action_name": { /* action parameters */ }
}
\`\`\`

When complete:
\`\`\`json
{
  "decision": "complete"
}
\`\`\`
</call_format>`,

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
1. Return valid JSON only (no markdown, no explanations)
2. Execute one action per iteration
3. When \`action\` is "X", include parameter "X" with tool inputs
4. Adapt based on results from previous actions
5. Continue until task is complete
</rules>

<format>
During execution:
\`\`\`json
{
  "action": "tool_name",
  "decision": "proceed|retry",
  "tool_name": { /* parameters */ }
}
\`\`\`

When complete (omit action):
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

  /**
   * Code Execution system prompt - progressive disclosure pattern
   *
   * Reduces token usage by:
   * 1. Loading tool definitions on-demand (progressive disclosure)
   * 2. Processing data in execution environment
   * 3. Only returning relevant results to model
   */
  CODE_EXECUTION:
    `Agentic tool \`{toolName}\` with code execution capabilities for efficient MCP interaction.

<manual>
{description}
</manual>

<execution_model>
You can execute JavaScript code that calls MCP tools directly.
Available in your execution environment:
- \`console.log(...)\`: Print output
- \`callMCPTool(toolName, params)\`: Call any discovered MCP tool
- All standard JavaScript/ES6+ features
</execution_model>

<rules>
1. **Discover Tools**: Use \`search_tools\` to find relevant tools
   - Searches tool names and descriptions
   - Returns full schemas immediately
   - Empty keyword = list all tools
2. **Execute Code**: Process data efficiently in your execution environment
   - Filter, transform, aggregate data before returning
   - Use loops and conditionals instead of chaining calls
   - Only log essential results to conserve tokens
3. **Format**:
   \`\`\`json
   {
     "action": "search_tools|execute_code",
     "keyword": "search term",  // for search_tools
     "code": "...",  // for execute_code
     "decision": "proceed|complete"
   }
   \`\`\`
4. Continue until \`decision: "complete"\`
</rules>

<example>
// Search for tools (returns full schemas)
{
  "action": "search_tools",
  "keyword": "github",
  "decision": "proceed"
}

// Execute code using discovered tools
{
  "action": "execute_code",
  "code": "const repo = await callMCPTool('github.getRepository', {owner: 'mcpc', name: 'mcpc'}); const recent = repo.issues.filter(i => new Date(i.updated) > Date.now() - 30*24*60*60*1000); console.log(\`Found \${recent.length} recent issues\`);",
  "decision": "complete"
}
</example>

<available_operations>
- \`search_tools\`: Find tools by keyword, returns full schemas (empty keyword = all tools)
- \`execute_code\`: Run JavaScript with callMCPTool() access
</available_operations>`,
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
  samplingWorkflowExecution: p(SystemPrompts.SAMPLING_WORKFLOW_EXECUTION),
  codeExecution: p(SystemPrompts.CODE_EXECUTION),
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
