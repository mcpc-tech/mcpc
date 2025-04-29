import {
  generateTencentCloudSignature,
  type TencentCloudAuthConfig,
} from "./adapters/auth/tc3-hmac-sha256.ts";
import type { OAPISpecDocument } from "./parser.ts";
import type { ExtendedAIToolSchema } from "./translator.ts";
import { p } from "@mcpc/core";

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
  params: Record<string, ExtendedAIToolSchema["inputSchema"]>,
): Promise<InvokerResponse> {
  const requestConfigGlobal = spec["x-request-config"] || {};

  const { pathParams = {}, inputParams = {} } = params;

  const baseUrl = requestConfigGlobal.baseUrl || spec.servers?.[0]?.url;
  const { headers = {}, timeout = 30000, retries = 0 } = requestConfigGlobal;

  const method = extendTool.method?.toLowerCase() || "get";
  const path = p(extendTool.path!)({ ...pathParams });
  const _op = extendTool._rawOperation!;
  const specificUrl = _op["x-custom-base-url"];

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
      authConfig,
    );
  }

  if (requestConfigGlobal.proxy) {
    const proxyConfig = requestConfigGlobal.proxy;
    const newUrl = new URL(proxyConfig.url);
    newUrl.searchParams.set(
      proxyConfig.param,
      url.toString(),
    );
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
          `Failed to invoke tool ${extendTool.name}: ${error.message}`,
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
