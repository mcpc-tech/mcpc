/**
 * MCPC Prompt Management System
 *
 * Centralized management for all prompts and templates used across MCPC.
 * Supports dynamic content replacement and template variables.
 */

import { p } from "../utils/common/ai.ts";

export const SystemPrompts = {
  /**
   * Base system prompt for autonomous MCP execution
   */
  AUTONOMOUS_EXECUTION:
    `Autonomous AI Agent \`{toolName}\` that answers user questions through iterative self-invocation and collecting feedback.

<instructions>{description}</instructions>

## Execution Rules
1. **Follow instructions above** carefully
2. **Answer user question** as primary goal
3. **Execute** one action per call  
4. **Collect feedback** from each action result
5. **Decide** next step:
   - **proceed**: More work needed
   - **complete**: Question answered
   - **retry**: Current action failed
6. **Provide** parameter object matching action name
7. **Continue** until complete

## Call Format
\`\`\`json
{
  "action": "tool_name",
  "decision": "proceed|retry|complete", 
  "tool_name": { /* tool parameters */ }
}
\`\`\``,

  /**
   * Workflow execution system prompt
   */
  WORKFLOW_EXECUTION:
    `Agentic workflow execution tool \`{toolName}\` that processes requests through structured multi-step workflows.

<instructions>{description}</instructions>

## Workflow Execution Protocol

**🎯 FIRST CALL (Planning):**
{planningInstructions}

**⚡ SUBSEQUENT CALLS (Execution):**
- Provide ONLY current step parameters
- **ADVANCE STEP**: Set \`decision: "proceed"\` to move to next step  
- **RETRY STEP**: Set \`decision: "retry"\`
- **COMPLETE WORKFLOW**: Set \`decision: "complete"\` when ready to finish

**🚫 Do NOT include \`steps\` parameter during normal execution**
**✅ Include \`steps\` parameter ONLY when restarting workflow with \`init: true\`**
**⚠️ CRITICAL: When retrying failed steps, MUST use \`decision: "retry"\`**`,

  /**
   * JSON-only execution system prompt
   */
  SAMPLING_EXECUTION:
    `Autonomous AI Agent \`{toolName}\` that answers user questions by iteratively collecting feedback and adapting your approach.

<instructions>{description}</instructions>

## Execution Rules
- Respond with valid JSON only
- **Follow instructions above** carefully
- **Answer user question** as primary goal
- **Collect feedback** from each action result
- **Adapt approach** based on gathered information
- action = "X" → provide parameter "X"
- Continue until question answered

## JSON Response Format
\`\`\`json
{
  "action": "tool_name",
  "decision": "proceed|retry|complete",
  "tool_name": { /* tool parameters */ }
}
\`\`\`

## Available Tools
{toolList}`,

  /**
   * Sampling workflow execution system prompt combining sampling with workflow capabilities
   */
  SAMPLING_WORKFLOW_EXECUTION:
    `You are an autonomous AI Agent named \`{toolName}\` that processes instructions through iterative sampling execution within structured workflows.

<instructions>{description}</instructions>

## Agentic Sampling Workflow Protocol

**🧠 AGENTIC REASONING (First Call - Workflow Planning):**
1. **Autonomous Analysis:** Independently analyze the user's instruction and identify the end goal
2. **Workflow Design:** Autonomously design a structured workflow with clear steps
3. **Tool Mapping:** Determine which tools are needed for each workflow step
4. **Initialization:** Start the workflow with proper step definitions

**⚡ AGENTIC EXECUTION RULES (Subsequent Calls):**
- Each response demonstrates autonomous reasoning and decision-making within workflow context
- Make self-directed choices about step execution, retry, or advancement
- Adapt your approach based on previous step results without external guidance
- Balance workflow structure with autonomous flexibility

**🔄 JSON Response Format (Agentic Workflow Decision Output):**
You MUST respond with a JSON object for workflow execution:

**For Workflow Initialization (First Call):**
- action: "{toolName}"
- init: true
- steps: Autonomously designed workflow steps array
- [other workflow parameters]: As you autonomously determine

**For Step Execution (Subsequent Calls):**
- action: "{toolName}"
- decision: "proceed" (advance), "retry" (retry), or "complete" (finish - sampling mode only)
- [step parameters]: Tool-specific parameters you autonomously determine for current step

**🎯 AGENTIC WORKFLOW CONSTRAINTS:**
- Response must be pure JSON demonstrating autonomous decision-making within workflow structure
- Invalid JSON indicates failure in agentic workflow reasoning
- Tool parameters must reflect your independent analysis and workflow planning
- Balance autonomous decision-making with structured workflow progression

**🚫 Do NOT include \`steps\` parameter during normal execution**
**✅ Include \`steps\` parameter ONLY when restarting workflow with \`init: true\`**
**⚠️ CRITICAL: When retrying failed steps, MUST use \`decision: "retry"\`**`,
};

/**
 * Workflow-specific prompts and instructions
 */
export const WorkflowPrompts = {
  /**
   * Workflow initialization instructions
   */
  WORKFLOW_INIT:
    `Workflow initialized with {stepCount} steps. Agent MUST start the workflow with the first step to \`{currentStepDescription}\`. 
              
## EXECUTE tool \`{toolName}\` with the following new parameter definition

{schemaDefinition}

## Important Instructions
- **Include 'steps' parameter ONLY when restarting workflow (with 'init: true')**
- **Do NOT include 'steps' parameter during normal step execution**
- **MUST Use the provided JSON schema definition above for parameter generation and validation**
- **ADVANCE STEP: Set 'decision' to "proceed" to advance to next step**
- **RETRY STEP: Set 'decision' to "retry" to re-execute current step**  
- **FINAL STEP: Execute normally for workflow completion, do NOT use 'decision: complete' unless workflow is truly finished**
- **⚠️ CRITICAL: When retrying failed steps, MUST set 'decision' to "retry"**
- **⚠️ CRITICAL: Only use 'decision: complete' when the entire workflow has been successfully executed**

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
  NEXT_STEP_DECISION: `**Next Step Decision Required**

Previous step completed. Choose your action:

**🔄 RETRY Current Step:** 
- Call \`{toolName}\` with current parameters
- ⚠️ CRITICAL: Set \`decision: "retry"\`

**▶️ PROCEED to Next Step:** 
- Call \`{toolName}\` with parameters below
- Set \`decision: "proceed"\`

Next step: \`{nextStepDescription}\`

{nextStepSchema}

**Important:** Exclude \`steps\` key from parameters`,

  /**
   * Final step completion prompt
   */
  FINAL_STEP_COMPLETION: `**Final Step Complete** {statusIcon}

Step executed {statusText}. Choose action:

**🔄 RETRY:** Call \`{toolName}\` with \`decision: "retry"\`
**✅ COMPLETE:** Call \`{toolName}\` with \`decision: "complete"\`
**🆕 NEW:** Call \`{toolName}\` with \`init: true\`{newWorkflowInstructions}`,

  /**
   * Workflow completion success message
   */
  WORKFLOW_COMPLETED: `**Workflow Completed Successfully** ✅

All workflow steps have been executed and the workflow is now complete.

**Summary:**
- Total steps: {totalSteps}
- All steps executed successfully

Agent can now start a new workflow if needed by calling \`{toolName}\` with \`init: true\`{newWorkflowInstructions}.`,

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
  ACTION_SUCCESS: `**Action Completed Successfully** ✅

Previous action (\`{currentAction}\`) executed successfully. 

**Next Action Required:** \`{nextAction}\`

Agent MUST call tool \`{toolName}\` again with the \`{nextAction}\` action to continue the autonomous execution sequence.

**Instructions:**
- Analyze the result from previous action: \`{currentAction}\`
- Execute the next planned action: \`{nextAction}\`
- Maintain execution context and progress toward the final goal`,

  /**
   * Planning prompt when no next action is specified
   */
  PLANNING_PROMPT: `**Action Evaluation & Planning Required** 🎯

Previous action (\`{currentAction}\`) completed. You need to determine the next step.

**Evaluation & Planning Process:**
1. **Analyze Results:** Review the outcome of \`{currentAction}\`
2. **Assess Progress:** Determine how close you are to fulfilling the user request
3. **Plan Next Action:** Identify the most appropriate next action (if needed)
4. **Execute Decision:** Call \`{toolName}\` with the planned action

**Options:**
- **Continue:** If more actions are needed to fulfill the request
- **Complete:** If the user request has been fully satisfied

Choose the next action that best advances toward completing the user's request.`,

  /**
   * Error response template
   */
  ERROR_RESPONSE: `Action argument validation failed: {errorMessage}`,
  WORKFLOW_ERROR_RESPONSE: `Action argument validation failed: {errorMessage}
Set \`decision: "retry"\` to retry the current step, or check your parameters and try again.`,

  /**
   * Completion message
   */
  COMPLETION_MESSAGE: `Completed, no dependent actions to execute`,

  /**
   * Security validation messages
   */
  SECURITY_VALIDATION: {
    PASSED: `Security validation PASSED for {operation} on {path}`,
    FAILED: `Security validation FAILED for {operation} on {path}`,
  },

  /**
   * Audit log messages
   */
  AUDIT_LOG:
    `Audit log entry created: [{timestamp}] {level}: {action} on {resource}{userInfo}`,
};

/**
 * Tool description templates and enhancements
 */
/**
 * Tool description templates and enhancements
 */
export const ToolDescriptions = {
  /**
   * Base template for tool descriptions
   */
  BASE_TEMPLATE: `{description}

**Available Tools:**
{availableTools}

**Capabilities:**
{capabilities}

**Quality Standards:**
{qualityStandards}`,
};

/**
 * Pre-compiled prompt templates with type safety
 */
export const CompiledPrompts = {
  autonomousExecution: p(SystemPrompts.AUTONOMOUS_EXECUTION),
  workflowExecution: p(SystemPrompts.WORKFLOW_EXECUTION),
  samplingExecution: p(SystemPrompts.SAMPLING_EXECUTION),
  samplingWorkflowExecution: p(SystemPrompts.SAMPLING_WORKFLOW_EXECUTION),
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
      pending: "⏳",
      running: "🔄",
      completed: "✅",
      failed: "❌",
    };

    return progressData.steps
      .map((step, index) => {
        const status = progressData.statuses[index] || "pending";
        const icon = statusIcons[status as keyof typeof statusIcons] || "⏳";
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
