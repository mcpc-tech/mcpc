/**
 * Test tool tag processing - core functionality
 *
 * Verifies that processToolTags properly handles tool tags.
 */

import { assertEquals } from "@std/assert";
import { processToolTags } from "../../src/utils/common/tool-tag-processor.ts";
import { load } from "cheerio";

Deno.test("processToolTags replaces existing tools and removes missing ones", () => {
  const description =
    'Use <tool name="existing"/> and <tool name="missing"/> tools';
  const $ = load(description);
  const tagToResults = { tool: $("tool").toArray() };

  const tools = {
    "existing": {
      name: "existing",
      description: "Existing tool",
      inputSchema: { type: "object" as const },
      execute: () => {},
    },
  } as any;

  const result = processToolTags({
    description,
    tagToResults,
    $,
    tools,
    toolOverrides: new Map(),
    toolNameMapping: new Map([["existing", "existing"]]),
  });

  // Should keep the tool tag with normalized name
  assertEquals(
    result.includes('<tool name="existing"'),
    true,
    "Should keep tool tag with normalized name",
  );

  // Should remove missing tool tag
  assertEquals(
    result.includes('name="missing"'),
    false,
    "Should remove missing tool tag",
  );
});
