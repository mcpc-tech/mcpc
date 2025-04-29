import { jsonrepair } from "jsonrepair";

/**
 * Attempts to parse JSON with a repair function if initial parse fails.
 */
export function parseJSON<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    try {
      const repairedText = jsonrepair(text);
      console.warn(
        `Failed to parse JSON, attempting to repair, result: ${text}`
      );
      return JSON.parse(repairedText) as T;
    } catch {
      return null;
    }
  }
}

export function truncateJSON(obj: unknown): string {
  return Deno.inspect(obj, {
    depth: 3,
    colors: false,
    // @ts-expect-error -
    maxStringLength: 120,
  });
}
