import { jsonrepair } from "jsonrepair";

/**
 * Strips common markdown code fences and explanatory text from LLM responses
 */
function stripMarkdownAndText(text: string): string {
  // Remove leading/trailing whitespace
  text = text.trim();

  // Remove markdown code fences: ```json ... ``` or ```...```
  text = text.replace(/^```(?:json)?\s*\n?/i, "");
  text = text.replace(/\n?```\s*$/, "");

  // Remove common LLM prefixes like "Here is the JSON:" or "Response:"
  text = text.replace(
    /^(?:here is|here's|response|result|output|json):\s*/i,
    "",
  );

  // Try to find JSON object/array boundaries if there's surrounding text
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    text = jsonMatch[1];
  }

  return text.trim();
}

/**
 * Attempts to parse JSON with automatic cleanup and repair if initial parse fails.
 * Handles common LLM output formats like:
 * - ```json{"key":"value"}```
 * - "Here is: {"key":"value"}"
 * - Markdown code fences
 * - Malformed JSON that can be repaired
 */
export function parseJSON<T, U extends boolean = false>(
  text: string,
  throwError?: U,
): U extends false ? T | null : T {
  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    try {
      // First attempt: strip markdown and explanatory text
      const cleanedText = stripMarkdownAndText(text);
      try {
        return JSON.parse(cleanedText) as T;
      } catch {
        // Second attempt: repair the cleaned JSON
        const repairedText = jsonrepair(cleanedText);
        console.warn(
          `Failed to parse JSON, cleaned and repaired. Original: ${
            text.slice(0, 100)
          }...`,
        );
        return JSON.parse(repairedText) as T;
      }
    } catch (_repairError) {
      if (throwError) {
        throw new Error(
          `Failed to parse JSON after cleanup and repair. Original error: ${
            _error instanceof Error ? _error.message : String(_error)
          }`,
        );
      }
      return null as T;
    }
  }
}

export function truncateJSON(obj: unknown): string {
  // Simple JSON truncation without node:util dependency
  return JSON.stringify(obj, null, 2).slice(0, 500) +
    (JSON.stringify(obj).length > 500 ? "..." : "");
}

export function optionalObject<T>(obj: T, condition: boolean): T {
  if (condition) {
    return obj;
  }
  return {} as T;
}
