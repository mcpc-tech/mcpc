import {
  extend,
  isObject,
  isArray,
  isNull,
  map,
  flow,
  set,
  unset,
  get,
  reduce,
  has,
  cloneDeep,
} from "@es-toolkit/es-toolkit/compat";
import {
  generateTencentCloudSignature,
  type TencentCloudAuthConfig,
} from "./adapters/auth/tc3-hmac-sha256.ts";
import type { OAPISpecDocument, OperationExtension } from "./parser.ts";
import type { ExtendedAIToolSchema } from "./translator.ts";
import { p } from "@mcpc/core";
import { writeFileSync } from "node:fs";

export const SENSITIVE_MARK = "*SENSITIVE*";

interface InvokerResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  raw: Response;
}

/**
 * Invokes a tool by name with the provided parameters
 *
 * @TODO: CacheConfigSchema ParameterExtensionSchema ResponseExtensionSchema
 */
export async function invoke(
  spec: OAPISpecDocument,
  extendTool: ExtendedAIToolSchema,
  params: Record<string, ExtendedAIToolSchema["inputSchema"]>
): Promise<InvokerResponse> {
  const requestConfigGlobal = spec["x-request-config"] || {};

  let { pathParams = {}, inputParams = {} } = params;

  const baseUrl = requestConfigGlobal.baseUrl || spec.servers?.[0]?.url;
  const { headers = {}, timeout = 30000, retries = 0 } = requestConfigGlobal;

  const method = extendTool.method?.toLowerCase() || "get";
  const path = p(extendTool.path!)({ ...pathParams });
  const _op = extendTool._rawOperation!;
  const specificUrl = _op["x-custom-base-url"];
  const sensitiveParams = _op["x-sensitive-params"] ?? {};

  inputParams = extend(inputParams, sensitiveParams);

  if ((!specificUrl && !baseUrl) || !method || !path) {
    throw new Error("Invalid tool configuration");
  }

  let requestHeaders = { ...headers };
  let requestBody: string | null = null;

  let url = new URL(specificUrl ?? baseUrl);

  const pathItems = path.split("/").slice(1);
  const pathRemaps = _op["x-remap-path-to-header"];
  if (pathRemaps) {
    for (const headerKey of _op["x-remap-path-to-header"] ?? []) {
      const currVal = pathItems.shift();
      if (currVal) {
        requestHeaders[headerKey] = currVal;
      }
    }
  } else {
    url.pathname = path;
  }

  // Add query parameters for GET requests
  if (method === "get" && Object.keys(inputParams).length > 0) {
    for (const [key, value] of Object.entries(inputParams)) {
      url.searchParams.append(key, String(value));
    }
  }

  // Add body for non-GET requests
  if (method !== "get" && Object.keys(inputParams).length > 0) {
    requestBody = JSON.stringify(inputParams);
    requestHeaders["content-type"] = "application/json";
  }

  // Handle Tencent Cloud API authentication if configured
  if (
    spec.components?.securitySchemes?.TencentCloudAuth &&
    requestConfigGlobal.auth?.TencentCloudAuth
  ) {
    const authConfig = requestConfigGlobal.auth
      .TencentCloudAuth as TencentCloudAuthConfig;

    // Get action from operation if available
    if (_op.operationId && !authConfig.action) {
      authConfig.action = _op.operationId;
    }
    if (requestHeaders["x-tc-service"]) {
      authConfig.service = requestHeaders["x-tc-service"];
    }

    // Prepare headers with TC3-HMAC-SHA256 signature
    // @ts-ignore
    requestHeaders = generateTencentCloudSignature(
      method,
      path,
      url.searchParams,
      requestHeaders,
      requestBody,
      authConfig
    );
  }

  if (requestConfigGlobal.proxy) {
    const proxyConfig = requestConfigGlobal.proxy;
    const newUrl = new URL(proxyConfig.url);
    newUrl.searchParams.set(proxyConfig.param, url.toString());
    url = newUrl;
  }

  const requestOptions: RequestInit = {
    method: method.toUpperCase(),
    headers: requestHeaders,
    signal: AbortSignal.timeout(timeout),
  };

  if (requestBody) {
    requestOptions.body = requestBody;
  }

  // Make the request with retries
  let response: Response | null = null;
  let error: Error | null = null;

  console.log(`Request Options: ${JSON.stringify(requestOptions)}`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      response = await fetch(url.toString(), requestOptions);
      break;
    } catch (err) {
      error = err as Error;
      if (attempt === retries) {
        throw new Error(
          `Failed to invoke tool ${extendTool.name}: ${error.message}`
        );
      }
      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }

  if (!response) {
    throw new Error(`Failed to invoke tool ${extendTool.name}: No response`);
  }

  // Parse response
  let data: unknown;
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  // Post process response
  data = postProcess(spec, extendTool, data);

  // Create response object
  const headerObj: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerObj[key] = value;
  });

  const invokerResponse = {
    status: response.status,
    statusText: response.statusText,
    headers: headerObj,
    data,
    raw: response,
  };

  return invokerResponse;
}

/**
 * Transforms a single data item (object) by applying inclusion, exclusion, and sensitive field masking rules.
 */
function transformItem(
  item: any,
  includeKeys: string[],
  excludeKeys: string[],
  sensitiveKeys: string[]
): any {
  // If item is not an object or is null, transformations do not apply.
  if (!isObject(item) || isNull(item)) {
    return item;
  }

  /**
   * Step 1: Creates the initial processed item.
   * If `includeKeys` are provided, a new object is constructed containing only those keys.
   * Otherwise, a deep clone of the original item is made.
   * @param {any} originalItem - The item to process.
   * @returns {any} The initial state of the processed item.
   */
  const createInitialItem = (originalItem: any): any => {
    if (includeKeys.length > 0) {
      // _.reduce to build the new object. _.set mutates the accumulator (acc).
      return reduce(
        includeKeys,
        (acc: any, pathString: string) => {
          const value = get(originalItem, pathString); // Use _.get
          if (value !== undefined) {
            set(acc, pathString, value); // Use _.set, mutates acc
          }
          return acc;
        },
        {} // Initial accumulator is an empty object
      );
    }
    return cloneDeep(originalItem); // Use _.cloneDeep
  };

  /**
   * Step 2: Applies exclusion logic to the item.
   * Keys specified in `excludeKeys` are deeply removed from the item.
   * This function mutates `currentProcessedItem`.
   * @param {any} currentProcessedItem - The item after inclusion/cloning.
   * @returns {any} The item with specified keys excluded.
   */
  const applyExclusions = (currentProcessedItem: any): any => {
    if (
      excludeKeys.length === 0 ||
      !isObject(currentProcessedItem) ||
      isNull(currentProcessedItem)
    ) {
      return currentProcessedItem;
    }

    for (const pathString of excludeKeys) {
      const pathSegments = pathString.split(".");
      if (pathSegments.length === 0) {
        continue; // Skip invalid empty path
      }

      // Lodash's _.unset can simplify this, but to keep the exact same logic as before:
      let current: any = currentProcessedItem;
      // Navigate to the parent of the target property
      for (let i = 0; i < pathSegments.length - 1; i++) {
        const segment = pathSegments[i];
        // Check if current is an object and has the segment
        if (isObject(current) && has(current, segment)) {
          current = get(current, segment);
        } else {
          current = null; // Path does not exist or is not an object
          break;
        }
      }

      // If path is valid and parent is an object, delete the target property
      if (isObject(current)) {
        const lastSegment = pathSegments[pathSegments.length - 1];
        // _.unset(current, lastSegment) could also be used here if current was the root object for that path
        if (has(current, lastSegment)) {
          unset(current, lastSegment);
        }
      }
    }
    return currentProcessedItem;
  };

  /**
   * Step 3: Applies sensitive field masking to the item.
   * Values of keys specified in `sensitiveKeys` are replaced with "***SENSITIVE***".
   * @param {any} currentProcessedItem - The item after exclusions.
   * @returns {any} The item with sensitive fields masked.
   */
  const applySensitization = (currentProcessedItem: any): any => {
    if (
      sensitiveKeys.length === 0 ||
      !isObject(currentProcessedItem) ||
      isNull(currentProcessedItem)
    ) {
      return currentProcessedItem;
    }
    // _.set will mutate currentProcessedItem.
    // We iterate and apply _.set for each sensitive key.
    // Using _.reduce here to chain mutations on the same object.
    return reduce(
      sensitiveKeys,
      (acc: any, pathString: string) => {
        const pathArray = pathString.split(".");
        if (has(acc, pathArray)) {
          // Check if path exists using _.has
          set(acc, pathArray, SENSITIVE_MARK); // _.set mutates acc
        }
        return acc;
      },
      currentProcessedItem // Start with the currentProcessedItem
    );
  };

  // Chain the transformation steps using _.flow (lodash equivalent of R.pipe)
  return flow(createInitialItem, applyExclusions, applySensitization)(item);
}

/**
 * Post-processes response data based on OpenAPI extension properties (x-include-response-keys,
 * x-exclude-response-keys, x-sensitive-response-fields) defined in an operation.
 * Supports dot-notation for nested keys (e.g., "a.b.c").
 */
export function postProcess(
  _spec: OAPISpecDocument,
  extendTool: ExtendedAIToolSchema,
  data: unknown
): unknown {
  const responseConfigGlobal = _spec["x-response-config"] || {};
  const op = extendTool._rawOperation;
  const processData = () => {
    if (!op) {
      return data;
    }

    const includeResponseKeys: string[] =
      op["x-include-response-keys"] ||
      responseConfigGlobal["includeResponseKeys"] ||
      [];
    const excludeResponseKeys: string[] =
      op["x-exclude-response-keys"] ||
      responseConfigGlobal["excludeResponseKeys"] ||
      [];
    const sensitiveResponseFields: string[] =
      op["x-sensitive-response-fields"] ||
      responseConfigGlobal["sensitiveResponseFields"] ||
      [];

    // If no transformation rules are defined, return the data unmodified.
    if (
      includeResponseKeys.length === 0 &&
      excludeResponseKeys.length === 0 &&
      sensitiveResponseFields.length === 0
    ) {
      return data;
    }

    const wasArray = isArray(data); // Use _.isArray
    const itemsToProcess = wasArray ? (data as any[]) : [data];

    // Use _.map for transformation
    const processedItems = map(itemsToProcess, (currentItem: any) => {
      return transformItem(
        currentItem,
        includeResponseKeys,
        excludeResponseKeys,
        sensitiveResponseFields
      );
    });

    return wasArray ? processedItems : processedItems[0];
  };

  const processedData = processData();
  return truncateData(processedData, responseConfigGlobal.maxLength);
}

function truncateData(data: unknown, maxLength?: number): unknown {
  if (!maxLength) {
    return data;
  }

  const stringified = JSON.stringify(data, null, 2);
  if (stringified.length <= maxLength) {
    return data;
  }

  return {
    message: `Response was truncated (length: ${stringified.length}, max: ${maxLength})`,
    truncatedData: stringified.slice(0, maxLength) + "...",
  };
}
