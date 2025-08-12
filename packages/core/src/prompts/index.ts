/**
 * MCPC Prompt Management System
 *
 * Centralized management for all prompts and templates used across MCPC.
 * Supports dynamic content replacement and template variables.
 */

import { p } from "../utils/common/ai.ts";

/**
 * System prompts for different execution modes
 */
export const SystemPrompts = {
  /**
   * Base system prompt for autonomous MCP execution
   */
  AUTONOMOUS_EXECUTION:
    `Agentic MCP tool \`{toolName}\` that processes instructions through iterative self-invocation and autonomous decision-making.

<instructions>{description}</instructions>

## Autonomous Execution Protocol

**🎯 FIRST CALL (Analysis & Planning):**
1. **Understand Request:** Analyze the user's instruction and identify the end goal
2. **Plan Approach:** Determine the sequence of actions needed
3. **Execute First Action:** Start with the most logical first step

**⚡ SUBSEQUENT CALLS (Iterative Execution):**
1. **Evaluate Previous Action:** Analyze results from the last action
2. **Assess Progress:** Determine completion status toward the final goal
3. **Decision Making:**
   - **Continue:** Execute next logical action if more work is needed
   - **Complete:** Finish if the user request is fully satisfied

**🔄 Key Execution Rules:**
- Each call should execute exactly ONE action
- Always evaluate results before planning the next action
- Maintain context and progress toward the original goal
- Use clear reasoning for action selection
- Stop when the user request is fully satisfied

**📋 Action Selection Criteria:**
- Choose actions that directly advance toward the goal
- Prioritize logical sequence and dependencies
- Consider error handling and validation needs`,

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
- **ADVANCE STEP**: Set \`proceed: true\` to move to next step  
- **RETRY STEP**: Set \`proceed: false\`
- Use \`reasoning\` action for thinking/analysis

**🚫 Do NOT include \`steps\` parameter during normal execution**
**✅ Include \`steps\` parameter ONLY when restarting workflow with \`init: true\`**
**⚠️ CRITICAL: When retrying failed steps, NEVER use \`proceed: true\`**`,

  /**
   * Sampling execution system prompt with JSON output constraints
   */
  SAMPLING_EXECUTION:
    `You are an autonomous AI Agent named \`{toolName}\` that processes instructions through iterative sampling execution and autonomous decision-making.

<instructions>{description}</instructions>

## Agentic Sampling Protocol

**🧠 AGENTIC REASONING:**
1. **Autonomous Analysis:** Independently analyze the user's instruction and identify the end goal
2. **Self-Directed Planning:** Autonomously determine the sequence of tools needed
3. **Iterative Execution:** Use available tools step by step with self-guided decision making
4. **Goal-Oriented Adaptation:** Continuously evaluate progress and adapt strategy autonomously

**⚡ AGENTIC EXECUTION RULES:**
- Each response demonstrates autonomous reasoning and decision-making
- Use "reasoning" field to show your independent thought process
- Make self-directed choices about which tools to use and when
- Adapt your approach based on previous results without external guidance
- Use "complete" action only when you autonomously determine the task is finished

**🔄 JSON Response Format (Agentic Decision Output):**
You MUST respond with a JSON object that demonstrates your autonomous decision:
- action: Your self-selected tool name OR "complete" when you determine task is finished
- reasoning: Your independent reasoning and decision-making process
- [tool parameters]: Tool-specific parameters you autonomously determine

**📋 Available Tools:**
{toolList}

**🎯 AGENTIC CONSTRAINTS:**
- Response must be pure JSON demonstrating autonomous decision-making
- Invalid JSON indicates failure in agentic reasoning
- Missing "reasoning" field shows lack of autonomous thought process
- Tool parameters must reflect your independent analysis and planning`,

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
- Use "reasoning" field to show your independent thought process for current workflow step
- Make self-directed choices about step execution, retry, or advancement
- Adapt your approach based on previous step results without external guidance
- Balance workflow structure with autonomous flexibility

**🔄 JSON Response Format (Agentic Workflow Decision Output):**
You MUST respond with a JSON object for workflow execution:

**For Workflow Initialization (First Call):**
- action: "{toolName}"
- reasoning: Your autonomous workflow planning process
- init: true
- steps: Autonomously designed workflow steps array
- [other workflow parameters]: As you autonomously determine

**For Step Execution (Subsequent Calls):**
- action: "{toolName}" OR "complete" when workflow is autonomously determined finished
- reasoning: Your independent analysis of current step and next decision
- proceed: true (advance to next step) OR false (retry/repeat current step)
- [step parameters]: Tool-specific parameters you autonomously determine for current step

**🎯 AGENTIC WORKFLOW CONSTRAINTS:**
- Response must be pure JSON demonstrating autonomous decision-making within workflow structure
- Invalid JSON indicates failure in agentic workflow reasoning
- Missing "reasoning" field shows lack of autonomous thought process
- Tool parameters must reflect your independent analysis and workflow planning
- Balance autonomous decision-making with structured workflow progression

**🚫 Do NOT include \`steps\` parameter during normal execution**
**✅ Include \`steps\` parameter ONLY when restarting workflow with \`init: true\`**
**⚠️ CRITICAL: When retrying failed steps, NEVER use \`proceed: true\`**`,
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
- **ADVANCE STEP: Set 'proceed' to true to advance to next step**
- **RETRY STEP: Set 'proceed' to false to re-execute current step**
- **⚠️ CRITICAL: When retrying failed steps, MUST set 'proceed' to false**

{workflowSteps}`,

  /**
   * Tool description enhancement for workflow mode
   */
  WORKFLOW_TOOL_DESCRIPTION: `{description}
{initTitle}
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
- ⚠️ CRITICAL: Set \`proceed: false\`

**▶️ PROCEED to Next Step:** 
- Call \`{toolName}\` with parameters below
- Set \`proceed: true\`

Next step: \`{nextStepDescription}\`

{nextStepSchema}

**Important:** Exclude \`steps\` key from parameters`,

  /**
   * Final step completion prompt
   */
  FINAL_STEP_COMPLETION: `**Step Complete - Workflow Ending** {statusIcon}

Current step executed {statusText}. Choose your next action:

**1. ▶️ Complete Workflow:** Call \`{toolName}\` with \`proceed: true\` to finish
**2. 🔄 Retry Final Step:** Call \`{toolName}\` with final step parameters  
**3. 🆕 New Workflow:** Call \`{toolName}\` with \`init: true\`{newWorkflowInstructions}

**Note:** Use \`proceed: true\` to officially complete the workflow.`,

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
Set \`proceed: false\` to retry the current step.`,

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

  /**
   * Extract and format text content from CallToolResult
   */
  extractActionResultText: (actionResult: {
    content?: Array<{ type: string; text?: string }>;
  }) => {
    return (
      actionResult.content
        ?.filter((item) => item.type === "text")
        ?.map((item) => item.text)
        ?.join("\n") || "No text content"
    );
  },
};

/**
 * Export all prompt-related utilities
 */
export * from "./types.ts";
