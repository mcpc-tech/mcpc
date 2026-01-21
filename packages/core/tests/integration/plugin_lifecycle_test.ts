/**
 * Plugin lifecycle test - all hooks
 */

import { assertEquals } from "@std/assert";
import { mcpcLegacy as mcpc } from "../../mod.ts";
import type { ToolPlugin } from "../../src/plugin-types.ts";
import { jsonSchema } from "../../src/utils/schema.ts";

Deno.test("Plugin lifecycle - all hooks execute in order", async () => {
  const order: string[] = [];

  const plugin: ToolPlugin = {
    name: "test-plugin",
    configureServer: () => {
      order.push("configureServer");
    },
    composeStart: () => {
      order.push("composeStart");
    },
    transformTool: (tool) => {
      order.push("transformTool");
      return tool;
    },
    finalizeComposition: () => {
      order.push("finalizeComposition");
    },
    composeEnd: () => {
      order.push("composeEnd");
    },
  };

  await mcpc(
    [{ name: "test-server", version: "1.0.0" }, {}],
    [{
      name: "test-agent",
      description: "Test agent",
      deps: { mcpServers: {} },
      plugins: [plugin],
    }],
    (server) => {
      server.tool(
        "test",
        "Test",
        jsonSchema({ type: "object", properties: {} }),
        () => ({ content: [{ type: "text", text: "ok" }] }),
      );
    },
  );

  assertEquals(order, [
    "configureServer",
    "composeStart",
    "transformTool",
    "finalizeComposition",
    "composeEnd",
  ]);
});
