import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";
import { AggregateAjvError } from "@segment/ajv-human-errors";

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
  const validate = ajv.compile(schema);
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
