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
  AUTONOMOUS_EXECUTION: `Agentic MCP tool \`{toolName}\` that processes instructions through iterative self-invocation.

<instructions>{description}</instructions>

## Action Execution Protocol

**🎯 Each Iteration:**
1. **Identify Current Action:** Select the single most appropriate action based on context and goals
2. **Plan Next Action:** Anticipate the likely next step needed (if any)

**⚡ Key Rules:**
- Execute ONE action per iteration
- Use structured protocol - no direct tool calls
- Always analyze results before proceeding`,

  /**
   * Workflow execution system prompt
   */
  WORKFLOW_EXECUTION: `Agentic workflow execution tool \`{toolName}\` that processes requests through structured multi-step workflows.

<instructions>{description}</instructions>

## Workflow Execution Protocol

**🎯 FIRST CALL (Planning):**
{planningInstructions}

**⚡ SUBSEQUENT CALLS (Execution):**
- Provide ONLY current step parameters
- **ADVANCE STEP**: Set \`proceed: true\` to move to next step  
- **RETRY STEP**: Set \`proceed: false\` (or omit) to retry current step
- Use \`reasoning\` action for thinking/analysis

**🚫 Do NOT include \`steps\` parameter during normal execution**
**✅ Include \`steps\` parameter ONLY when restarting workflow with \`init: true\`**
**⚠️ CRITICAL: When retrying failed steps, NEVER use \`proceed: true\`**`,

  /**
   * Tool usage instructions for models without native tool support
   */
  TOOL_USAGE_INSTRUCTIONS: `# Tool Usage Instructions

Use tools by outputting this exact format (no extra formatting):
{startTag}{"name": "tool_name", "parameters": {"param1": "value1"}}{endTag}

**CRITICAL RULES:**
1. Include both {startTag} and {endTag} tags
2. Closing tag MUST immediately follow JSON (no spaces/newlines) 
3. One tool per turn - wait for response
4. Parameters contain actual values only (not type definitions)
5. No parameter code blocks - execute directly

## Tool Format Examples
✅ Correct: {startTag}{"name": "search", "parameters": {"query": "AI research"}}{endTag}
❌ Wrong: {"name": "search", "parameters": {"query": "AI research"}} (missing tags)

## Available Tools:
{toolDefinitions}`,
};

/**
 * Workflow-specific prompts and instructions
 */
export const WorkflowPrompts = {
  /**
   * Workflow initialization instructions
   */
  WORKFLOW_INIT: `Workflow initialized with {stepCount} steps. You MUST start the workflow with the first step to \`{currentStepDescription}\`. 
              
## EXECUTE tool \`{toolName}\` with following new tool arguments

{schemaDefinition}

## Important Instructions
- **Include 'steps' parameter ONLY when restarting workflow (with 'init: true')**
- **Do NOT include 'steps' parameter during normal step execution**
- **MUST Use the provided JSON schema definition above for parameter generation and validation**
- **ADVANCE STEP: Set 'proceed' to true to advance to next step**
- **RETRY STEP: Set 'proceed' to false or omit it to re-execute current step**
- **⚠️ CRITICAL: When retrying failed steps, NEVER set 'proceed' to true**
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
  DYNAMIC_WORKFLOW_PLANNING: `- Set \`init: true\` and define complete \`steps\` array`,
};

/**
 * Response templates for different scenarios
 */
export const ResponseTemplates = {
  /**
   * Success response for tool execution
   */
  TOOL_SUCCESS: `# You WILL call this tool(\`{toolName}\`) AGAIN using the \`{nextAction}\` action, after evaluating the result from previous action({currentAction}):`,

  /**
   * Planning prompt when no next action is specified
   */
  PLANNING_PROMPT: `# You WILL plan next action if the user request needs additional actions to be fulfilled, after evaluating the result from previous action({currentAction}):`,

  /**
   * Error response template
   */
  ERROR_RESPONSE: `Tool/Function argument validation failed: {errorMessage}`,

  /**
   * Completion message
   */
  COMPLETION_MESSAGE: `Completed, no dependent tools to execute`,

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
  AUDIT_LOG: `Audit log entry created: [{timestamp}] {level}: {action} on {resource}{userInfo}`,
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
  toolUsageInstructions: p(SystemPrompts.TOOL_USAGE_INSTRUCTIONS),
  workflowInit: p(WorkflowPrompts.WORKFLOW_INIT),
  workflowToolDescription: p(WorkflowPrompts.WORKFLOW_TOOL_DESCRIPTION),
  toolSuccess: p(ResponseTemplates.TOOL_SUCCESS),
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
  generateToolList: (tools: Array<{ name: string; description?: string; hide?: boolean }>) => {
    return tools
      .filter(tool => !tool.hide)
      .map(tool => `<tool name="${tool.name}"${tool.description ? ` description="${tool.description}"` : ''}/>`)
      .join('\n');
  },

  /**
   * Generate hidden tool list for descriptions
   */
  generateHiddenToolList: (tools: Array<{ name: string; hide?: boolean }>) => {
    return tools
      .filter(tool => tool.hide)
      .map(tool => `<tool name="${tool.name}" hide/>`)
      .join('\n');
  },

  /**
   * Format workflow steps for display
   */
  formatWorkflowSteps: (steps: Array<{ description: string; actions: string[] }>) => {
    if (!steps.length) return '';
    return `## Workflow Steps\n${JSON.stringify(steps, null, 2)}`;
  },

  /**
   * Generate user info for audit logs
   */
  formatUserInfo: (user?: string) => {
    return user ? ` by ${user}` : '';
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
