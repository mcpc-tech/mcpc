import { jsonrepair } from "jsonrepair";
import { inspect } from "node:util";

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
        `Failed to parse JSON, attempting to repair, result: ${text}`,
      );
      return JSON.parse(repairedText) as T;
    } catch {
      return null;
    }
  }
}

export function truncateJSON(obj: unknown): string {
  return inspect(obj, {
    depth: 3,
    colors: false,
    maxStringLength: 120,
  });
}

export function optionalObject<T>(obj: T, condition: boolean): T {
  if (condition) {
    return obj;
  }
  return {} as T;
}
