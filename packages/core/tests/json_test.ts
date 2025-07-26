import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.201.0/assert/mod.ts";
import {
  optionalObject,
  parseJSON,
  truncateJSON,
} from "../src/utils/common/json.ts";

Deno.test("JSON utilities - parseJSON with valid JSON", () => {
  const validJson = '{"name": "test", "value": 123}';
  const result = parseJSON(validJson);

  assertEquals(result, { name: "test", value: 123 });
});

Deno.test("JSON utilities - parseJSON with invalid JSON that can be repaired", () => {
  // Missing quotes around keys - jsonrepair should fix this
  const invalidJson = '{name: "test", value: 123}';
  const result = parseJSON(invalidJson);

  assertEquals(result, { name: "test", value: 123 });
});

Deno.test("JSON utilities - parseJSON with completely invalid JSON", () => {
  const invalidJson = "this is not json at all";
  const result = parseJSON(invalidJson);

  // jsonrepair returns the original string when it can't repair it
  assertEquals(result, "this is not json at all");
});

Deno.test("JSON utilities - parseJSON with null input", () => {
  const result = parseJSON("null");

  assertEquals(result, null);
});

Deno.test("JSON utilities - parseJSON with array", () => {
  const arrayJson = '[1, 2, 3, "test"]';
  const result = parseJSON<number[]>(arrayJson);

  assertEquals(result, [1, 2, 3, "test"]);
});

Deno.test("JSON utilities - truncateJSON with simple object", () => {
  const obj = { name: "test", value: 123 };
  const result = truncateJSON(obj);

  assertExists(result);
  assertEquals(typeof result, "string");
});

Deno.test("JSON utilities - truncateJSON with nested object", () => {
  const obj = {
    level1: {
      level2: {
        level3: {
          level4: "deep value",
        },
      },
    },
  };
  const result = truncateJSON(obj);

  assertExists(result);
  assertEquals(typeof result, "string");
});

Deno.test("JSON utilities - optionalObject with true condition", () => {
  const obj = { name: "test", value: 123 };
  const result = optionalObject(obj, true);

  assertEquals(result, obj);
});

Deno.test("JSON utilities - optionalObject with false condition", () => {
  const obj = { name: "test", value: 123 };
  const result = optionalObject(obj, false);

  // optionalObject returns {} as T when condition is false
  assertEquals(typeof result, "object");
  assertEquals(Object.keys(result).length, 0);
});

Deno.test("JSON utilities - optionalObject with complex object", () => {
  const obj = {
    nested: {
      array: [1, 2, 3],
      string: "test",
    },
  };
  const result = optionalObject(obj, true);

  assertEquals(result, obj);
});
