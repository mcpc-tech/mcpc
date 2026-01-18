export type JSONSchema = Record<string, unknown>;

export type ToolCallback = (args: unknown, extra?: unknown) => unknown;

export interface SamplingConfig {
  maxIterations?: number;
  /**
   * Use LLM to summarize sub-agent results (default: true).
   * Set to false to return full conversation history for debugging.
   */
  summarize?: boolean;
}

export interface RegisterToolParams {
  description: string;
  name: string;
  allToolNames: string[];
  depGroups: Record<string, unknown>;
  toolNameToDetailList: [string, unknown][];
}

/**
 * XML-like tool reference string where only `name` is required.
 * Examples accepted:
 * - `<tool name="foo"/>`
 * - `<tool name="foo" description="desc"/>`
 * - `<tool name="foo" hide/>`
 * - `<tool name="foo" global/>`
 * - `<tool name="foo" description="desc" hide global/>`
 */
export type ToolDesc = "" | ` description="${string}"`;
export type ToolFlags =
  | ""
  | " hide"
  | " global"
  | " hide global"
  | " global hide";
export type ToolEnd = "/>" | " />";

export type ToolRefXml =
  | `<tool name="${string}"${ToolDesc}${ToolFlags}${ToolEnd}`
  | `<tool name="${string}"${ToolFlags}${ToolDesc}${ToolEnd}`;
