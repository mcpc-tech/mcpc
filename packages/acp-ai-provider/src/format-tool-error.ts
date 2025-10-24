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
    if (blk.type === "content") {
      if (blk.content.type === "text") {
        parts.push(typeof blk.content.text);
      }
    }
  }
  return parts.join("\n");
}
