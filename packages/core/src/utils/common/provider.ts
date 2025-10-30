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
 * Creates a Google-compatible JSON schema by removing unsupported features
 *
 * Google provider restrictions:
 * - Does not support additionalProperties in schema definitions (at any level)
 * - Does not support oneOf, allOf, or anyOf at the top level in input_schema
 * @see https://ai.google.dev/api/caching#Schema
 */
export const createGoogleCompatibleJSONSchema = (
  schema: Record<string, unknown>,
): Record<string, unknown> => {
  if (!GEMINI_PREFERRED_FORMAT) {
    return schema;
  }

  // Remove top-level composition keywords
  const { oneOf: _oneOf, allOf: _allOf, anyOf: _anyOf, ...cleanSchema } =
    schema;

  // Recursively remove additionalProperties at all levels
  const removeAdditionalProperties = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(removeAdditionalProperties);
    }

    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        if (key !== "additionalProperties") {
          result[key] = removeAdditionalProperties(value);
        }
      }

      return result;
    }

    return obj;
  };

  return removeAdditionalProperties(cleanSchema);
};
