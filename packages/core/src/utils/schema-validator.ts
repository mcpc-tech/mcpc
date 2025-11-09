import { Ajv } from "ajv";
import addFormats from "ajv-formats";
import { AggregateAjvError } from "@segment/ajv-human-errors";

// Singleton Ajv instance
const ajv = new Ajv({
  allErrors: true,
  verbose: true,
});

addFormats.default(ajv);

export function validateSchema(
  args: Record<string, unknown>,
  schema: Record<string, unknown>,
): { valid: boolean; error?: string } {
  const validate = ajv.compile(schema);
  if (!validate(args)) {
    const errors = new AggregateAjvError(validate.errors!);
    return {
      valid: false,
      error: errors.message,
    };
  }
  return { valid: true };
}
