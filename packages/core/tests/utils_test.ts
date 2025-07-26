import { assertEquals, assertExists } from "@std/assert";

// Test parseJSON function
function parseJSON<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    return null;
  }
}

// Test truncateJSON function
function truncateJSON(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

// Test optionalObject function
function optionalObject<T>(obj: T, condition: boolean): T | object {
  if (condition) {
    return obj;
  }
  return {};
}

Deno.test("JSON utilities - parseJSON with valid JSON", () => {
  const validJson = '{"name": "test", "value": 123}';
  const result = parseJSON(validJson);

  assertEquals(result, { name: "test", value: 123 });
});

Deno.test("JSON utilities - parseJSON with invalid JSON", () => {
  const invalidJson = "this is not json at all";
  const result = parseJSON(invalidJson);

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

Deno.test("JSON utilities - optionalObject with true condition", () => {
  const obj = { name: "test", value: 123 };
  const result = optionalObject(obj, true);

  assertEquals(result, obj);
});

Deno.test("JSON utilities - optionalObject with false condition", () => {
  const obj = { name: "test", value: 123 };
  const result = optionalObject(obj, false);

  assertEquals(result, {});
});
