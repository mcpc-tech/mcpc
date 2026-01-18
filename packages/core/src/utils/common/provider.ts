/**
 * AI model provider's restrciton
 */

import { GEMINI_PREFERRED_FORMAT } from "./config.ts";
import { optionalObject } from "./json.ts";

/**
 * Provider restriction: tools.0.custom.input_schema.properties: Property keys should match pattern '^[a-zA-Z0-9_\-\p{L}\p{N}]{1,64}$
 * Supports: alphanumeric (ASCII + unicode), underscore, dash, and unicode letters (including Chinese)
 */
export const ToolNameRegex = /^[a-zA-Z0-9_\-\p{L}\p{N}]{1,64}$/u;

/**
 * Sanitize tool name to match provider requirements
 * Replaces special characters (like @ . , / etc) with underscore
 * Preserves alphanumeric, underscore, dash, and unicode characters
 * Truncates to 64 characters max
 */
export function sanitizePropertyKey(name: string): string {
  return name
    .replace(/[@.,/\\:;!?#$%^&*()[\]{}]/g, "_") // Replace special characters with underscore
    .substring(0, 64); // Truncate to max length
}

/**
 * Conditionally adds additionalProperties to schema based on provider support
 *
 * Note: Google Gemini does not support additionalProperties in schema definitions
 * @see https://ai.google.dev/api/caching#Schema
 */
export const createGoogleJSONSchema = (
  additionalProperties: boolean | Record<string, unknown>,
): Record<string, unknown> => {
  return optionalObject({ additionalProperties }, !GEMINI_PREFERRED_FORMAT);
};

/**
 * Creates a model-compatible JSON schema by removing validation-only features
 *
 * Always removes:
 * - errorMessage: AJV-specific custom error messages, not part of JSON Schema spec
 *
 * Google provider restrictions (when GEMINI_PREFERRED_FORMAT is enabled):
 * - Does not support additionalProperties in schema definitions (at any level)
 * - Does not support oneOf, allOf, or anyOf at the top level in input_schema
 * @see https://ai.google.dev/api/caching#Schema
 */
export const createModelCompatibleJSONSchema = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  // Keys to always remove (not part of JSON Schema spec, used by validators only)
  const validatorOnlyKeys = ["errorMessage"];

  // Keys to remove only for Gemini
  const geminiRestrictedKeys = GEMINI_PREFERRED_FORMAT
    ? ["additionalProperties"]
    : [];

  const keysToRemove = new Set([...validatorOnlyKeys, ...geminiRestrictedKeys]);

  // Remove top-level composition keywords for Gemini
  let cleanSchema = schema;
  if (GEMINI_PREFERRED_FORMAT) {
    const { oneOf: _oneOf, allOf: _allOf, anyOf: _anyOf, ...rest } = schema;
    cleanSchema = rest;
  }

  // Recursively clean schema
  const cleanRecursively = (obj: unknown): unknown => {
    if (Array.isArray(obj)) {
      return obj.map(cleanRecursively);
    }

    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        if (!keysToRemove.has(key)) {
          result[key] = cleanRecursively(value);
        }
      }

      return result;
    }

    return obj;
  };

  return cleanRecursively(cleanSchema) as Record<string, unknown>;
};

/**
 * Internal/metadata keys that should not be exposed in tool definitions
 */
const INTERNAL_SCHEMA_KEYS = new Set([
  "$schema", // JSON Schema meta
  "_originalName", // MCPC internal - original tool name before mapping
  "_type", // TypeScript phantom type
  "annotations", // MCP tool annotations (title, readOnlyHint, etc.)
]);

/**
 * Cleans a tool schema for display, removing internal/metadata fields
 * Use this when returning tool definitions to users/models
 *
 * Also unwraps schema wrapper objects (jsonSchema property) to expose actual schema
 */
export const cleanToolSchema = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  const cleanRecursively = (obj: unknown): unknown => {
    if (Array.isArray(obj)) {
      return obj.map(cleanRecursively);
    }

    if (obj && typeof obj === "object") {
      const record = obj as Record<string, unknown>;

      // Unwrap schema wrapper: { jsonSchema: {...} } -> {...}
      if (
        "jsonSchema" in record &&
        typeof record.jsonSchema === "object" &&
        record.jsonSchema !== null
      ) {
        return cleanRecursively(record.jsonSchema);
      }

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(record)) {
        if (!INTERNAL_SCHEMA_KEYS.has(key)) {
          result[key] = cleanRecursively(value);
        }
      }

      return result;
    }

    return obj;
  };

  return cleanRecursively(schema) as Record<string, unknown>;
};
