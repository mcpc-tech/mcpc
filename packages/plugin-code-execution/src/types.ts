/**
 * JSON-RPC 2.0 Protocol Types
 * Used for communication between host and Deno sandbox
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

// Error codes
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom error codes
  EXECUTION_ERROR: -32000,
  TIMEOUT_ERROR: -32001,
  TOOL_CALL_ERROR: -32002,
} as const;

/**
 * Method names for JSON-RPC communication
 */
export const JsonRpcMethod = {
  // Sandbox -> Host
  CALL_TOOL: "callMCPTool",
  LOG: "log",

  // Host -> Sandbox
  EXECUTE_CODE: "executeCode",
  GET_TOOL_DEFINITIONS: "getToolDefinitions",
} as const;

/**
 * Request to execute code in sandbox
 */
export interface ExecuteCodeRequest {
  code: string;
  hasDefinitions: string[];
}

/**
 * Request to call an MCP tool from sandbox
 */
export interface CallToolRequest {
  toolName: string;
  params: unknown;
}

/**
 * Request to get tool definitions
 */
export interface GetToolDefinitionsRequest {
  toolNames: string[];
}

/**
 * Log message from sandbox
 */
export interface LogNotification {
  level: "log" | "error" | "warn" | "info";
  args: unknown[];
}
