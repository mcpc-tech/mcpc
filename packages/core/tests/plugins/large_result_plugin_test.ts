import { mcpc } from "../../mod.ts";
import { jsonSchema } from "../../src/utils/schema.ts";
import { createLargeResultPlugin } from "../../src/plugins/large-result.ts";
import type { ComposeDefinition } from "../../src/set-up-mcp-compose.ts";
import type { ComposableMCPServer } from "../../src/compose.ts";

interface ToolResult {
  content?: { type: string; text: string }[];
}

Deno.test("large-result plugin truncates and enables search", async () => {
  const plugin = createLargeResultPlugin({
    maxSize: 500,
    previewSize: 200,
    search: { maxResults: 5, maxOutputSize: 2000, timeoutMs: 50 },
  });

  const server = await mcpc(
    [
      { name: "test-large", version: "1.0.0" },
      { capabilities: { tools: { listChanged: true } } },
    ],
    [
      {
        name: "agent",
        description: "agent with large-result plugin",
        plugins: [plugin],
      } as ComposeDefinition,
    ],
    (server: ComposableMCPServer) => {
      // Tool that returns very large output
      server.tool(
        "huge_output",
        "Generate huge output",
        jsonSchema<Record<string, unknown>>({
          type: "object",
          properties: {},
        }),
        () => {
          const SENTINEL = "SENTINEL";
          const big = new Array(2000).fill(SENTINEL).join(" ");
          return { content: [{ type: "text" as const, text: big }] };
        },
      );
    },
  );

  // Invoke tool to trigger large-result handling
  const res = (await server.callTool("huge_output", {})) as ToolResult;
  const text = res?.content?.find((c) => c.type === "text")?.text || "";

  if (!text || !text.includes("Result too large") || !text.includes("File:")) {
    throw new Error(
      "Large-result plugin did not report truncation and file path",
    );
  }

  // Extract saved file path
  const match = text.match(/File:\*\*\s+(.+)\n/) ||
    text.match(/File:\s+(.+)\n/);
  const filePath = match?.[1]?.trim();
  if (!filePath) {
    throw new Error("Could not extract file path from plugin message");
  }

  // Search for the sentinel in the saved file
  const search = (await server.callTool("agent__search-tool-result", {
    pattern: "SENTINEL",
    path: filePath,
  })) as ToolResult;
  const out = search?.content?.find((c) => c.type === "text")?.text || "";
  if (!out || !(out.includes("Found") || out.includes("matches"))) {
    throw new Error(`Search did not return expected matches. Output: ${out}`);
  }

  // Wait beyond search timeout to ensure internal timer has fired, avoiding test leak
  await new Promise((r) => setTimeout(r, 60));
});
