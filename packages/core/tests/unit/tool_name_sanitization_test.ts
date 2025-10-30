/**
 * Test tool name sanitization - core functionality
 *
 * Verifies that sanitizePropertyKey properly handles special characters.
 */

import { assertEquals } from "@std/assert";
import { sanitizePropertyKey } from "../../src/utils/common/provider.ts";

Deno.test("sanitizePropertyKey removes special characters", () => {
  // Test real-world MCP tool name: @c/desktop-commander.start_process
  assertEquals(
    sanitizePropertyKey("@c/desktop-commander.start_process"),
    "_c_desktop-commander_start_process",
  );

  // Verify dash is preserved
  assertEquals(
    sanitizePropertyKey("server-tool-name"),
    "server-tool-name",
  );

  assertEquals(
    sanitizePropertyKey("你好.hey"),
    "你好_hey",
  );
});
