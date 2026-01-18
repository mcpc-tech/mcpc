/**
 * Type definitions for the MCPC prompt management system
 */

/**
 * Base template variable mapping
 */
export interface PromptVariables {
  [key: string]: string | number | boolean;
}

/**
 * Tool definition for prompt generation
 */
export interface ToolDefinition {
  name: string;
  description?: string;
  hide?: boolean;
}

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  description: string;
  actions: string[];
}

/**
 * Execution mode types
 */
export type ExecutionMode =
  | "agentic"
  | "agentic_workflow"
  | "agentic_workflow_sampling"
  | "ai_sampling"
  | "ai_acp"
  | (string & Record<never, never>);

/**
 * Prompt template configuration
 */
export interface PromptTemplate {
  template: string;
  variables: PromptVariables;
  compiled?: (variables: PromptVariables) => string;
}

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  isValid: boolean;
  operation: string;
  path: string;
  message: string;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  action: string;
  resource: string;
  user?: string;
}

/**
 * Tool response format
 */
export interface ToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Workflow state information
 */
export interface WorkflowStateInfo {
  isInitialized: boolean;
  currentStep?: WorkflowStep;
  stepIndex: number;
  totalSteps: number;
  hasNextStep: boolean;
}
