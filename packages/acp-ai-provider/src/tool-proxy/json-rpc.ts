/**
 * JSON-RPC 2.0 message handler
 *
 * Provides utilities for creating and parsing JSON-RPC messages.
 */

import type { JsonRpcError, JsonRpcRequest, JsonRpcResponse } from "./types.ts";

let requestIdCounter = 0;

/**
 * Create a unique request ID
 */
export function createRequestId(): string {
  return `${Date.now()}-${++requestIdCounter}`;
}

/**
 * Create a JSON-RPC request
 */
export function createRequest(
  method: string,
  params?: unknown,
): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: createRequestId(),
    method,
    params,
  };
}

/**
 * Create a JSON-RPC success response
 */
export function createResponse(
  id: string | number,
  result: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

/**
 * Create a JSON-RPC error response
 */
export function createErrorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return {
    jsonrpc: "2.0",
    id,
    error,
  };
}

/**
 * Parse a JSON-RPC message from a string
 */
export function parseMessage(
  line: string,
): JsonRpcRequest | JsonRpcResponse | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed.jsonrpc !== "2.0") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Serialize a message to JSON string
 */
export function serializeMessage(
  message: JsonRpcRequest | JsonRpcResponse,
): string {
  return JSON.stringify(message);
}
