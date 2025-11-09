/**
 * JSON-RPC Message Handler
 * Handles encoding/decoding and validation of JSON-RPC messages
 */

import type { JsonRpcError, JsonRpcRequest, JsonRpcResponse } from "./types.ts";

export class JsonRpcHandler {
  private requestId = 0;

  createRequest(method: string, params?: unknown): JsonRpcRequest {
    return { jsonrpc: "2.0", id: ++this.requestId, method, params };
  }

  createResponse(
    id: string | number,
    result?: unknown,
    error?: JsonRpcError,
  ): JsonRpcResponse {
    return { jsonrpc: "2.0", id, result, error };
  }

  createErrorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: unknown,
  ): JsonRpcResponse {
    return this.createResponse(id, undefined, { code, message, data });
  }

  /**
   * Parse JSON-RPC message from string
   */
  parseMessage(data: string): JsonRpcRequest | JsonRpcResponse | null {
    try {
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object" || parsed.jsonrpc !== "2.0") {
        return null;
      }

      if ("method" in parsed) return parsed as JsonRpcRequest;
      if ("result" in parsed || "error" in parsed) {
        return parsed as JsonRpcResponse;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Serialize message to string
   */
  serializeMessage(message: JsonRpcRequest | JsonRpcResponse): string {
    return JSON.stringify(message);
  }

  /**
   * Validate JSON-RPC request
   */
  validateRequest(request: JsonRpcRequest): JsonRpcError | null {
    if (request.jsonrpc !== "2.0") {
      return {
        code: -32600,
        message: "Invalid Request: jsonrpc must be '2.0'",
      };
    }

    if (!request.method || typeof request.method !== "string") {
      return {
        code: -32600,
        message: "Invalid Request: method must be a string",
      };
    }

    if (request.id !== undefined) {
      const idType = typeof request.id;
      if (idType !== "string" && idType !== "number") {
        return {
          code: -32600,
          message: "Invalid Request: id must be a string or number",
        };
      }
    }

    return null;
  }
}
