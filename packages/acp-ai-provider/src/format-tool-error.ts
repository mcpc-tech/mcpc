import type { ToolCallContent } from "@agentclientprotocol/sdk";

/**
 * Format a tool result (array of ToolCallContent) into a human readable
 * error string. ACP tool results can contain a variety of content blocks
 * (text, error objects, json/data, etc.) so this helper attempts to
 * extract the most useful information in a defensive way.
 */
export function formatToolError(toolResult: Array<ToolCallContent>): string {
  if (!toolResult || toolResult.length === 0) return "Unknown tool error";

  const parts: string[] = [];
  for (const blk of toolResult) {
    if (blk == null) {
      parts.push("(null)");
      continue;
    }
    if (typeof blk === "string") {
      parts.push(blk);
      continue;
    }
    const b: any = blk as any;
    const txt = b.text ??
      b.message ??
      b.error ??
      (b.value ?? b.data ? JSON.stringify(b.value ?? b.data) : undefined);
    parts.push(typeof txt === "string" ? txt : JSON.stringify(b));
  }
  return parts.join("\n");
}
