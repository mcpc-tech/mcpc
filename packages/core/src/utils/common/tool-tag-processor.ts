import type { CheerioAPI } from "cheerio";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCallback } from "../../types.ts";
import type { ToolConfig } from "../../plugin-types.ts";

interface ComposedTool extends Tool {
  execute: ToolCallback;
}

const ALL_TOOLS_PLACEHOLDER = "__ALL__";

interface ProcessToolTagsParams {
  description: string;
  tagToResults: Record<string, unknown[]>;
  $: CheerioAPI;
  tools: Record<string, ComposedTool>;
  toolOverrides: Map<string, ToolConfig>;
  toolNameMapping?: Map<string, string>;
}

/**
 * Find the tool ID for a given tool name
 */
function findToolId(
  toolName: string,
  tools: Record<string, ComposedTool>,
  toolNameMapping?: Map<string, string>,
): string | undefined {
  // Try mapping first
  const mappedId = toolNameMapping?.get(toolName);
  if (mappedId) {
    return mappedId;
  }

  // Try direct matching with dot/underscore notation conversion
  return Object.keys(tools).find((id) => {
    const dotNotation = id.replace(/_/g, ".");
    return toolName === id || toolName === dotNotation;
  });
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

    if (!toolName || toolName.includes(ALL_TOOLS_PLACEHOLDER)) {
      $(toolEl).remove();
      return;
    }

    const override = toolOverrides.get(toolName);

    if (override?.visibility?.hidden) {
      // Remove the tag completely for hidden tools
      // Manipulate DOM directly instead of brittle string replace
      $(toolEl).remove();
    } else if (override?.visibility?.public) {
      $(toolEl).replaceWith(`<tool name="${toolName}"/>`);
    } else {
      const toolId = findToolId(toolName, tools, toolNameMapping);
      if (toolId) {
        // Replace <tool> with <action action="..."/> in the DOM
        $(toolEl).replaceWith(`<action action="${toolId}"/>`);
      } else {
        // Tool not found, remove the tag completely
        $(toolEl).remove();
      }
    }
  });

  // Return the updated HTML from the DOM; fallback to original if undefined
  return $.root().html() ?? description;
}
