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
 * Execution mode types
 */
export type ExecutionMode =
  | "agentic"
  | "ai_sampling"
  | "ai_acp"
  | "code_execution"
  | "code_execution_sampling"
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
