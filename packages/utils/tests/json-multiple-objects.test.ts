import { assertEquals } from "@std/assert";
import { parseJSON } from "../src/json.ts";

Deno.test("parseJSON - handles multiple JSON objects by taking the first one", () => {
  const duplicateJson =
    '{"action":"filesystem_read_file","decision":"proceed","nextAction":"filesystem_read_file","filesystem_read_file":{"path":"codex-rs/core/src/mcp_connection_manager.rs"}}{"action":"filesystem_read_file","decision":"proceed","nextAction":"filesystem_read_file","filesystem_read_file":{"path":"codex-rs/core/src/mcp_connection_manager.rs"}}';

  const result = parseJSON(duplicateJson, true);

  assertEquals(result, {
    action: "filesystem_read_file",
    decision: "proceed",
    nextAction: "filesystem_read_file",
    filesystem_read_file: {
      path: "codex-rs/core/src/mcp_connection_manager.rs",
    },
  });
});

Deno.test("parseJSON - handles nested objects correctly", () => {
  const nestedJson =
    '{"outer":{"inner":{"deep":"value"},"array":[1,2,3]},"next":"field"}{"should":"ignore"}';

  const result = parseJSON(nestedJson, true);

  assertEquals(result, {
    outer: {
      inner: {
        deep: "value",
      },
      array: [1, 2, 3],
    },
    next: "field",
  });
});

Deno.test("parseJSON - handles JSON arrays", () => {
  const arrayJson = '[{"a":1},{"b":2}][{"c":3}]';

  const result = parseJSON(arrayJson, true);

  assertEquals(result, [{ a: 1 }, { b: 2 }]);
});

Deno.test("parseJSON - handles strings with quotes correctly", () => {
  const stringWithQuotes =
    '{"message":"He said \\"hello\\" to me"}{"ignore":"this"}';

  const result = parseJSON(stringWithQuotes, true);

  assertEquals(result, {
    message: 'He said "hello" to me',
  });
});

Deno.test("parseJSON - handles markdown code fences with multiple objects", () => {
  const markdownJson =
    '```json\n{"action":"test","value":123}{"extra":"object"}\n```';

  const result = parseJSON(markdownJson, true);

  assertEquals(result, {
    action: "test",
    value: 123,
  });
});

Deno.test("parseJSON - handles explanatory text before JSON", () => {
  const textBeforeJson =
    'Here is the response: {"action":"test","value":123}{"extra":"object"}';

  const result = parseJSON(textBeforeJson, true);

  assertEquals(result, {
    action: "test",
    value: 123,
  });
});
