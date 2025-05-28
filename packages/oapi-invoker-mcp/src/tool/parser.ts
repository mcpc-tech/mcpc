import { promises } from "node:fs";
import process from "node:process";
import { parse } from "yaml";
import { z } from "zod";
import type { OpenAPI } from "@scalar/openapi-types";
import { openapi } from "@scalar/openapi-parser";
import { mergeDeep } from "remeda";
import { p } from "@mcpc/core";

const SPEC_ENV = {
  method: undefined,
  path: undefined,
};

/**
 * Zod schemas for OpenAPI extensions
 */
// Tool options extension schema
const ToolOptionsSchema = z.object({
  "x-tool-name-format": z
    .string()
    .optional()
    .describe(
      "Format string for generating tool names, e.g. '{method}-{path}' or '{operationId}'"
    ),
  "x-tool-name-prefix": z
    .string()
    .optional()
    .describe("Prefix to add to all tool names"),
  "x-tool-name-suffix": z
    .string()
    .optional()
    .describe("Suffix to add to all tool names"),
});

// Filter rules extension schema
const FilterRulesSchema = z.object({
  "x-filter-rules": z
    .array(
      z.object({
        pathPattern: z
          .string()
          .optional()
          .describe("Regex pattern to match API paths"),
        methodPattern: z
          .string()
          .optional()
          .describe("Regex pattern to match HTTP methods"),
        operationIdPattern: z
          .string()
          .optional()
          .describe("Regex pattern to match operationId"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Include operations with these tags"),
        exclude: z
          .boolean()
          .optional()
          .describe("Exclude matching operations instead of including them"),
      })
    )
    .optional()
    .describe("Rules to determine which operations to include"),
});

// Request configuration extension schema
const RequestConfigSchema = z.object({
  "x-request-config": z
    .object({
      baseUrl: z.string().optional().describe("Base URL for API requests"),
      proxy: z
        .object({
          url: z.string().describe("Proxy URL"),
          param: z.string().describe("Path parameter name"),
        })
        .optional()
        .describe("Proxy configuration for requests"),

      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("Default headers to include with every request"),
      timeout: z
        .number()
        .optional()
        .describe("Request timeout in milliseconds"),
      retries: z
        .number()
        .optional()
        .describe("Number of retry attempts for failed requests"),
      auth: z
        .object({
          TencentCloudAuth: z.object({
            secretId: z.string(),
            secretKey: z.string(),
            token: z.string().optional(),
            service: z.string().optional(),
            region: z.string().optional(),
            version: z.string().optional(),
            action: z.string().optional(),
          }),
        })
        .optional(),
    })
    .optional()
    .describe("HTTP request configuration"),
});

// Response configuration extension schema
const ResponseConfigSchema = z.object({
  "x-response-config": z
    .object({
      maxLength: z
        .number()
        .optional()
        .describe("Maximum length of response content"),
      "includeResponseKeys": z
        .array(z.string())
        .optional()
        .describe("Include response keys in the tool output"),

      "excludeResponseKeys": z
        .array(z.string())
        .optional()
        .describe("Exclude response keys from the tool output"),

      "sensitiveResponseFields": z
        .array(z.string())
        .optional()
        .describe("Mark response fields as sensitive"),
    })
    .optional()
    .describe("Response handling configuration"),
});

// Cache configuration extension schema
const CacheConfigSchema = z.object({
  "x-cache-key": z
    .string()
    .optional()
    .describe("Cache key for storing parsed OpenAPI schema"),
  "x-fresh-cache": z.boolean().optional().describe("Force refresh the cache"),
});

// Operation extensions schema
const OperationExtensionSchema = z
  .object({
    "x-examples": z
      .array(z.string())
      .optional()
      .describe("Add request examples to the operation description"),
    "x-remap-path-to-header": z
      .array(z.string().describe("Header key to remap to"))
      .optional(),
    "x-custom-base-url": z.string().optional(),
    "x-sensitive-params": z
      .record(z.string(), z.string())
      .describe("Mark data as sensitive (will be redacted from LLM)"),
    "x-sensitive-response-fields": z
      .array(z.string())
      .optional()
      .describe("Mark response fields as sensitive"),
    "x-include-response-keys": z
      .array(z.string())
      .optional()
      .describe("Include response keys in the tool output"),
    "x-exclude-response-keys": z
      .array(z.string())
      .optional()
      .describe("Exclude response keys from the tool output"),
  })
  .merge(ToolOptionsSchema);

// Parameter extensions schema
const ParameterExtensionSchema = z.object({
  "x-examples": z
    .array(z.string())
    .optional()
    .describe("Example value for this parameter"),
});

// Response extensions schema
const ResponseExtensionSchema = z.object({
  "x-examples": z
    .array(z.string())
    .optional()
    .describe("Example value for this response"),
  "x-sensitive": z
    .boolean()
    .optional()
    .describe("Mark response fields as sensitive"),
  "x-tree-shaking-func": z
    .string()
    .optional()
    .describe("Tree shaking response data"),
});

// Combined root schema for OpenAPI extensions
const OpenAPIExtensionsSchema = z.object({
  ...ToolOptionsSchema.shape,
  ...FilterRulesSchema.shape,
  ...RequestConfigSchema.shape,
  ...CacheConfigSchema.shape,
  ...OperationExtensionSchema.shape,
  ...ParameterExtensionSchema.shape,
  ...ResponseExtensionSchema.shape,
  ...ResponseConfigSchema.shape,
});

// Export types derived from schemas
export type ToolOptionsExtension = z.infer<typeof ToolOptionsSchema>;
export type FilterRulesExtension = z.infer<typeof FilterRulesSchema>;
export type RequestConfigExtension = z.infer<typeof RequestConfigSchema>;
export type CacheConfigExtension = z.infer<typeof CacheConfigSchema>;
export type OperationExtension = z.infer<typeof OperationExtensionSchema>;
export type ParameterExtension = z.infer<typeof ParameterExtensionSchema>;
export type ResponseExtension = z.infer<typeof ResponseExtensionSchema>;
export type OpenAPIExtensions = z.infer<typeof OpenAPIExtensionsSchema>;

/**
 * Represents an OpenAPI specification document with custom extensions
 */
export type OAPISpecDocument = OpenAPI.Document<OpenAPIExtensions>;

export type OAPIOperation = OpenAPI.Operation<OperationExtension>;

export type OAPISpecSrcFormat = "yaml" | "json";

/**
 * Filters OpenAPI operations based on provided filter rules
 */
export function filterSpec(spec: OAPISpecDocument): OAPISpecDocument {
  const filterRules = spec["x-filter-rules"];
  if (!filterRules || filterRules.length === 0) {
    return spec;
  }

  const filteredPaths: Record<string, Record<string, OAPIOperation>> = {};
  // Process each path and method
  for (const path in spec.paths) {
    const pathItem = spec.paths[path];
    const filteredPathItem: Record<string, OAPIOperation> = {};

    // Process each HTTP method (GET, POST, PUT, DELETE, etc.)
    for (const method in pathItem) {
      if (["get", "post", "put", "delete", "patch"].includes(method)) {
        const operation = pathItem[
          method as keyof typeof pathItem
        ] as OAPIOperation;
        if (method === "$ref") continue;

        let include = false;

        for (const rule of filterRules) {
          let matches = true;

          if (rule.pathPattern && !new RegExp(rule.pathPattern).test(path)) {
            matches = false;
          }

          if (
            rule.methodPattern &&
            !new RegExp(rule.methodPattern).test(method)
          ) {
            matches = false;
          }

          if (
            rule.operationIdPattern &&
            operation.operationId &&
            !new RegExp(rule.operationIdPattern).test(operation.operationId)
          ) {
            matches = false;
          }

          if (rule.tags && operation.tags) {
            const hasMatchingTag = rule.tags.some((tag) =>
              operation.tags?.includes(tag)
            );
            if (!hasMatchingTag) {
              matches = false;
            }
          }

          if (matches) {
            include = !rule.exclude;
            break;
          }
        }

        if (include) {
          filteredPathItem[method] = operation;
        }
      }
    }

    if (Object.keys(filteredPathItem).length > 0) {
      filteredPaths[path] = filteredPathItem;
    }
  }

  spec.paths = filteredPaths as typeof spec.paths;

  return spec;
}

/**
 * Reads the OpenAPI specification from either a URL or file path specified in the environment variables.
 * The specification can be provided through either local path or remote url
 */
async function readOAPISpec({
  path,
  url,
  format = "json",
  env = { ...process.env, ...SPEC_ENV },
}: {
  path?: string;
  url?: string;
  format?: OAPISpecSrcFormat;
  env?: NodeJS.ProcessEnv;
}): Promise<OAPISpecDocument | null> {
  if (url) {
    try {
      const response = await fetch(url);
      let data = await response.text();
      if (env) {
        data = p(data)(env);
      }
      return format === "yaml" ? parse(data) : JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to fetch OpenAPI spec from URL: ${error}`);
    }
  }

  if (path) {
    try {
      let data = await promises.readFile(path, "utf-8");
      if (env) {
        data = p(data)(env);
      }
      return format === "yaml" ? parse(data) : JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to read OpenAPI spec from file: ${error}`);
    }
  }

  return null;
}

export async function parseOAPISpecWithExtensions({
  format = "json",
  extensionFormat = "yaml",
}: {
  format?: OAPISpecSrcFormat;
  extensionFormat?: OAPISpecSrcFormat;
}): Promise<OAPISpecDocument> {
  const spec = await readOAPISpec({
    url: process.env.SPEC_URL,
    path: process.env.SPEC_PATH,
    format: (process.env.SPEC_FORMAT ?? format) as OAPISpecSrcFormat,
  });

  const specWithExtensions = await readOAPISpec({
    url: process.env.SPEC_EXTENSION_URL,
    path: process.env.SPEC_EXTENSION_PATH,
    format: (process.env.SPEC_EXTENSION_FORMAT ??
      extensionFormat) as OAPISpecSrcFormat,
  });

  const parsed = mergeDeep(spec ?? {}, specWithExtensions ?? {});
  // TODO: cache specification
  const { schema } = await openapi().load(parsed).upgrade().dereference().get();
  const filtered = filterSpec(schema as OAPISpecDocument);
  return filtered;
}
