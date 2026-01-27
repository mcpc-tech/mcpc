import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";
import { AggregateAjvError } from "@segment/ajv-human-errors";
import { cleanToolSchema } from "./common/provider.ts";

// Singleton Ajv instance with custom error message support
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
  strict: false, // Disable strict mode to allow non-standard keywords
});

addFormats.default(ajv);
ajvErrors.default(ajv);

export function validateSchema(
  data: unknown,
  schema: Record<string, unknown>,
): { valid: boolean; error?: string } {
  // Clean internal/metadata fields (including $schema) before validation,
  // fixes ajv error: no schema with key or ref "https://json-schema.org/draft/2020-12/schema"
  const cleanedSchema = cleanToolSchema(schema);
  const validate = ajv.compile(cleanedSchema);
  if (!validate(data)) {
    const errors = validate.errors!;

    // If there are custom errorMessage errors, use only those
    const customErrors = errors.filter((err) => err.keyword === "errorMessage");
    if (customErrors.length > 0) {
      const messages = [...new Set(customErrors.map((err) => err.message))];
      return {
        valid: false,
        error: messages.join("; "),
      };
    }

    // Fallback to human-readable error formatting
    const aggregateError = new AggregateAjvError(errors);
    return {
      valid: false,
      error: aggregateError.message,
    };
  }
  return { valid: true };
}
