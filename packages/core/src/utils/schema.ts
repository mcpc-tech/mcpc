/**
 * Internal Schema types and helpers
 * Replaces AI SDK dependencies while maintaining compatibility
 */

import type { JSONSchema } from "../types.ts";

/**
 * Schema symbols for internal type checking
 * Compatible with both MCPC and Vercel AI SDK
 */
const schemaSymbol = Symbol.for("mcpc.schema");
const vercelSchemaSymbol = Symbol.for("vercel.ai.schema");
const validatorSymbol = Symbol.for("mcpc.validator");

/**
 * Schema type that wraps JSON Schema with type information
 * Compatible with both MCPC and Vercel AI SDK
 */
export interface Schema<T = unknown> {
  readonly [vercelSchemaSymbol]?: true;
  readonly [schemaSymbol]: true;
  readonly [validatorSymbol]: true;
  readonly _type?: T; // Phantom type for TypeScript inference
  readonly jsonSchema: JSONSchema;
  readonly validate?: (value: unknown) => { success: boolean; value?: T };
}

/**
 * Wraps a JSON Schema object into our Schema type
 * Compatible with AI SDK's jsonSchema() function
 *
 * @param schema - JSON Schema object or already wrapped Schema
 * @param options - Optional validation configuration
 * @returns Schema<T> wrapper or the original schema if already wrapped
 *
 * @example
 * ```typescript
 * const schema = jsonSchema({
 *   type: "object",
 *   properties: {
 *     name: { type: "string" }
 *   }
 * });
 * ```
 */
export function jsonSchema<T = unknown>(
  schema: JSONSchema | Schema<T>,
  options: {
    validate?: (value: unknown) => { success: boolean; value?: T };
  } = {},
): Schema<T> {
  // If already wrapped, return as-is (for backward compatibility)
  if (isWrappedSchema(schema)) {
    return schema as Schema<T>;
  }

  return {
    [schemaSymbol]: true,
    [validatorSymbol]: true,
    _type: undefined as T,
    jsonSchema: schema as JSONSchema,
    validate: options.validate,
  };
}

/**
 * Type guard to check if a value is a wrapped Schema
 */
export function isWrappedSchema(value: unknown): value is Schema {
  return (
    typeof value === "object" &&
    value !== null &&
    ((schemaSymbol in value && (value as any)[schemaSymbol] === true) ||
      (vercelSchemaSymbol in value &&
        (value as any)[vercelSchemaSymbol] === true))
  );
}

/**
 * Extract JSON Schema from wrapped or unwrapped schema
 * Provides backward compatibility with both formats
 *
 * @param schema - Schema object (wrapped or unwrapped)
 * @returns The underlying JSON Schema
 */
export function extractJsonSchema(schema: Schema | JSONSchema): JSONSchema {
  if (isWrappedSchema(schema)) {
    return schema.jsonSchema;
  }
  return schema as JSONSchema;
}
