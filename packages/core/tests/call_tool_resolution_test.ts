import { mcpc } from "../mod.ts";
import { jsonSchema } from "ai";

Deno.test("callTool resolves tools from registry (no config)", async () => {
  const server = await mcpc(
    [
      { name: "test-server", version: "1.0.0" },
      { capabilities: { tools: { listChanged: true } } },
    ],
    [
      {
        name: "agent",
        description: "simple agent",
        // no deps, defaults to agentic mode
      } as any,
    ],
    (server: any) => {
      // Register a tool without any visibility config entry
      server.tool(
        "cls_SearchLog",
        "Search logs",
        jsonSchema<Record<string, unknown>>({
          type: "object",
          properties: { q: { type: "string" } },
          additionalProperties: true,
        }),
        (args: Record<string, unknown>) => {
          return { content: [{ type: "text" as const, text: `ok:${args.q}` }] };
        },
      );
    },
  );

  const res = (await server.callTool("cls_SearchLog", { q: "ping" })) as any;
  const text = res?.content?.find((c: any) => c.type === "text")?.text ?? "";
  if (!text.includes("ok:ping")) {
    throw new Error(`Unexpected result: ${text}`);
  }
});
