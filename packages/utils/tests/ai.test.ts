import { assertEquals } from "@std/assert";
import { p } from "../src/ai.ts";

Deno.test("p() replaces simple variables", () => {
  const fn = p("Hello {name}!");
  assertEquals(fn({ name: "World" }), "Hello World!");
});

Deno.test("p() handles multiple variables", () => {
  const fn = p("{greeting} {name}!");
  assertEquals(fn({ greeting: "Hi", name: "Alice" }), "Hi Alice!");
});

Deno.test("p() ignores JSON-like content in template", () => {
  // JSON syntax like {"key": "value"} should NOT be treated as variables
  const template = `Example: { "tool": "exec", "args": { "code": "1+1" } }`;
  const fn = p(template);
  // No variables to replace, should return template as-is
  assertEquals(fn({} as Record<never, string>), template);
});

Deno.test("p() handles dot notation variables", () => {
  const fn = p("User: {user.name}");
  assertEquals(fn({ "user.name": "Bob" }), "User: Bob");
});
