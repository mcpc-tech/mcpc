/**
 * Tests for JSON-RPC handler
 */

import { assertEquals } from "@std/assert";
import { JsonRpcHandler } from "../src/json-rpc.ts";
import type { JsonRpcRequest } from "../src/types.ts";

Deno.test("JsonRpcHandler - create request", () => {
  const handler = new JsonRpcHandler();
  const request = handler.createRequest("test_method", { key: "value" });

  assertEquals(request.jsonrpc, "2.0");
  assertEquals(request.method, "test_method");
  assertEquals(request.params, { key: "value" });
  assertEquals(typeof request.id, "number");
});

Deno.test("JsonRpcHandler - create response", () => {
  const handler = new JsonRpcHandler();
  const response = handler.createResponse(1, { result: "success" });

  assertEquals(response.jsonrpc, "2.0");
  assertEquals(response.id, 1);
  assertEquals(response.result, { result: "success" });
});

Deno.test("JsonRpcHandler - create error response", () => {
  const handler = new JsonRpcHandler();
  const response = handler.createErrorResponse(1, -32600, "Invalid Request");

  assertEquals(response.jsonrpc, "2.0");
  assertEquals(response.id, 1);
  assertEquals(response.error?.code, -32600);
  assertEquals(response.error?.message, "Invalid Request");
});

Deno.test("JsonRpcHandler - parse message", () => {
  const handler = new JsonRpcHandler();
  const message = '{"jsonrpc":"2.0","method":"test","id":1}';
  const parsed = handler.parseMessage(message) as JsonRpcRequest;

  assertEquals(parsed?.jsonrpc, "2.0");
  assertEquals(parsed?.method, "test");
  assertEquals(parsed?.id, 1);
});

Deno.test("JsonRpcHandler - serialize message", () => {
  const handler = new JsonRpcHandler();
  const request = handler.createRequest("test_method", { key: "value" });
  const serialized = handler.serializeMessage(request);

  const parsed = JSON.parse(serialized);
  assertEquals(parsed.jsonrpc, "2.0");
  assertEquals(parsed.method, "test_method");
});

Deno.test("JsonRpcHandler - validate request", () => {
  const handler = new JsonRpcHandler();
  const validRequest = handler.createRequest("test", {});
  const error = handler.validateRequest(validRequest);

  assertEquals(error, null);
});

Deno.test("JsonRpcHandler - validate invalid request", () => {
  const handler = new JsonRpcHandler();
  const invalidRequest: JsonRpcRequest = {
    jsonrpc: "1.0" as "2.0",
    method: "test",
    id: 1,
  };
  const error = handler.validateRequest(invalidRequest);

  assertEquals(error?.code, -32600);
});
