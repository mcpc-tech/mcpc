import type { CheerioAPI } from "cheerio";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCallback } from "../../types.ts";

interface ComposedTool extends Tool {
  execute: ToolCallback;
}

interface ToolOverrideOptions {
  description?: string;
  hide?: boolean;
  args?: (originalArgs: unknown) => unknown;
  handler?: ToolCallback;
}

const ALL_TOOLS_PLACEHOLDER = "__ALL__";
const ACTION_KEY = "action";

interface ProcessToolTagsParams {
  description: string;
  tagToResults: Record<string, unknown[]>;
  $: CheerioAPI;
  tools: Record<string, ComposedTool>;
  toolOverrides: Map<string, ToolOverrideOptions>;
  toolNameMapping?: Map<string, string>; // Mapping from toolNameWithScope to toolId
}

/**
 * Process tool tags in description and replace them with action tags or remove them if hidden
 */
export function processToolTags({
  description,
  tagToResults,
  $,
  tools,
  toolOverrides,
  toolNameMapping,
}: ProcessToolTagsParams): string {
  tagToResults.tool.forEach((toolEl: any) => {
    const toolName = toolEl.attribs.name;
    if (toolName && !toolName.includes(ALL_TOOLS_PLACEHOLDER)) {
      // Check if this tool is marked as hidden
      const override = toolOverrides.get(toolName);
      const isHidden = override?.hide;

      if (isHidden) {
        // Remove the tag completely for hidden tools
        description = description.replace(
          $(toolEl).prop("outerHTML")!,
          "",
        );
      } else {
        // Find the corresponding toolId for this toolName
        // First try the mapping from composeMcpDepTools
        let toolId = toolNameMapping?.get(toolName);

        // If not found in mapping, try the original matching logic
        if (!toolId) {
          toolId = Object.keys(tools).find((id) => {
            // Handle both dot notation and underscore notation
            const dotNotation = id.replace(/_/g, ".");
            return toolName === id || toolName === dotNotation;
          });
        }

        if (toolId) {
          description = description.replace(
            $(toolEl).prop("outerHTML")!,
            `<action ${ACTION_KEY}="${toolId}"/>`,
          );
        }
      }
    }
  });

  return description;
}
