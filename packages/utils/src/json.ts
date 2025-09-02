import { jsonrepair } from "jsonrepair";

/**
 * Attempts to parse JSON with a repair function if initial parse fails.
 */
export function parseJSON<T, U extends boolean = false>(
  text: string,
  throwError?: U,
): U extends false ? T | null : T {
  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    try {
      const repairedText = jsonrepair(text);
      console.warn(
        `Failed to parse JSON, attempting to repair, result: ${text}`,
      );
      if (throwError) {
        throw _error;
      }
      return JSON.parse(repairedText) as T;
    } catch {
      if (throwError) {
        throw new Error("Failed to parse repaired JSON");
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
