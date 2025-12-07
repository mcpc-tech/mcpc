/**
 * Shared types for the tool proxy protocol
 */

/**
 * JSON-RPC 2.0 message types
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

/**
 * JSON-RPC error codes
 */
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Protocol methods
 */
export const ProxyMethod = {
  // Host -> Proxy
  REGISTER_TOOLS: "registerTools",
  // Proxy -> Host
  CALL_HANDLER: "callHandler",
} as const;

/**
 * Tool definition sent from host to proxy
 */
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Handler call request from proxy to host
 */
export interface CallHandlerParams {
  name: string;
  args: unknown;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
