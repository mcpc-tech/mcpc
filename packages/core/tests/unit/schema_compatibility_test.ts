/**
 * Tests for Schema backward compatibility
 * Verifies that both wrapped (jsonSchema()) and unwrapped (plain JSON Schema) formats work
 */

import { assertEquals } from "@std/assert";
import { mcpcLegacy as mcpc } from "../../mod.ts";
import {
  extractJsonSchema,
  isWrappedSchema,
  jsonSchema,
} from "../../src/utils/schema.ts";

Deno.test("Schema - jsonSchema() wraps plain JSON Schema", () => {
  const plainSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  };

  const wrapped = jsonSchema(plainSchema);

  assertEquals(isWrappedSchema(wrapped), true);
  assertEquals(wrapped.jsonSchema, plainSchema);
});

Deno.test("Schema - jsonSchema() is idempotent (already wrapped)", () => {
  const plainSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  };

  const wrapped1 = jsonSchema(plainSchema);
  const wrapped2 = jsonSchema(wrapped1);

  // Should return the same wrapped schema
  assertEquals(wrapped1, wrapped2);
  assertEquals(wrapped1.jsonSchema, plainSchema);
});

Deno.test("Schema - extractJsonSchema handles both formats", () => {
  const plainSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  };

  // Extract from wrapped
  const wrapped = jsonSchema(plainSchema);
  const extracted1 = extractJsonSchema(wrapped);
  assertEquals(extracted1, plainSchema);

  // Extract from unwrapped (should pass through)
  const extracted2 = extractJsonSchema(plainSchema as any);
  assertEquals(extracted2, plainSchema);
});

Deno.test("Schema - server.tool() accepts wrapped schema", async () => {
  const server = await mcpc(
    [{ name: "test", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "wrapped-tool",
        "Test with wrapped schema",
        jsonSchema<{ value: string }>({
          type: "object",
          properties: {
            value: { type: "string" },
          },
        }),
        (args: { value: string }) => ({
          content: [{ type: "text", text: `Received: ${args.value}` }],
        }),
      );
    },
  );

  const result = await server.callTool("wrapped-tool", {
    value: "test",
  }) as any;
  assertEquals(result.content[0].text, "Received: test");
});

Deno.test("Schema - server.tool() accepts unwrapped schema", async () => {
  const server = await mcpc(
    [{ name: "test", version: "1.0.0" }, {}],
    [],
    (server) => {
      server.tool(
        "unwrapped-tool",
        "Test with unwrapped schema",
        {
          type: "object",
          properties: {
            value: { type: "string" },
          },
        } as any, // Cast to bypass TypeScript type checking (for backward compat)
        (args: { value: string }) => ({
          content: [{ type: "text", text: `Received: ${args.value}` }],
        }),
      );
    },
  );

  const result = await server.callTool("unwrapped-tool", {
    value: "test",
  }) as any;
  assertEquals(result.content[0].text, "Received: test");
});

Deno.test("Schema - mixed wrapped and unwrapped schemas", async () => {
  const server = await mcpc(
    [{ name: "test", version: "1.0.0" }, {}],
    [],
    (server) => {
      // Wrapped schema
      server.tool(
        "tool1",
        "Wrapped",
        jsonSchema<{ a: string }>({
          type: "object",
          properties: { a: { type: "string" } },
        }),
        (args: { a: string }) => ({
          content: [{ type: "text", text: `tool1: ${args.a}` }],
        }),
      );

      // Unwrapped schema
      server.tool(
        "tool2",
        "Unwrapped",
        {
          type: "object",
          properties: { b: { type: "string" } },
        } as any,
        (args: { b: string }) => ({
          content: [{ type: "text", text: `tool2: ${args.b}` }],
        }),
      );
    },
  );

  const result1 = await server.callTool("tool1", { a: "value1" }) as any;
  assertEquals(result1.content[0].text, "tool1: value1");

  const result2 = await server.callTool("tool2", { b: "value2" }) as any;
  assertEquals(result2.content[0].text, "tool2: value2");
});

Deno.test("Schema - isWrappedSchema type guard", () => {
  const plainSchema = {
    type: "object",
    properties: {},
  };

  assertEquals(isWrappedSchema(plainSchema), false);
  assertEquals(isWrappedSchema(jsonSchema(plainSchema)), true);
  assertEquals(isWrappedSchema(null), false);
  assertEquals(isWrappedSchema(undefined), false);
  assertEquals(isWrappedSchema("string"), false);
  assertEquals(isWrappedSchema(123), false);
});
