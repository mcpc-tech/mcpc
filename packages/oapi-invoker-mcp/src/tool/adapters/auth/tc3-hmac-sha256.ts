/**
 * @see https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/common/sign.ts
 */

import type { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";

/**
 * Configuration for Tencent Cloud API authentication
 */
export interface TencentCloudAuthConfig {
  secretId: string;
  secretKey: string;
  token?: string;
  service?: string;
  region?: string;
  version?: string;
  action?: string;
}

/**
 * Generates a Tencent Cloud API Signature V3 (TC3-HMAC-SHA256)
 */
export function generateTencentCloudSignature(
  method: string,
  _path: string,
  query: URLSearchParams,
  headers: Record<string, string>,
  body: string | null,
  authConfig: TencentCloudAuthConfig
): Record<string, string | number> {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = getDate(timestamp);

  // Extract service name from config, host header, or default
  const host = headers["host"];
  const service = authConfig.service || (host ? host.split(".")[0] : "service");

  // Prepare headers for signing
  const headersToSign = new Map<string, string | number>();

  // Add headers from input
  Object.entries(headers).forEach(([key, value]) => {
    headersToSign.set(key.toLowerCase(), value);
  });

  if (authConfig.action && !headersToSign.has("x-tc-action")) {
    headersToSign.set("x-tc-action", authConfig.action.toLowerCase());
  }

  if (authConfig.version && !headersToSign.has("x-tc-version")) {
    headersToSign.set("x-tc-version", authConfig.version);
  }

  if (authConfig.region && !headersToSign.has("x-tc-region")) {
    headersToSign.set("x-tc-region", authConfig.region);
  }

  headersToSign.set("x-tc-timestamp", timestamp);

  if (authConfig.token) {
    headersToSign.set("x-tc-token", authConfig.token);
  }

  // Determine which headers to sign
  const signedHeaders = Array.from(headersToSign.keys())
    .filter((key) => key === "content-type" || key === "host")
    .sort();

  const canonicalHeaders = signedHeaders
    .map((key) => `${key}:${headersToSign.get(key) || ""}\n`)
    .join("");

  const signedHeadersString = signedHeaders.join(";");

  // Hash the payload
  const hashedPayload = getHash(body || "");

  // Build canonical request
  const canonicalURI = "/";
  const canonicalQueryString = Array.from(query.entries())
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join("&");

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalURI,
    canonicalQueryString,
    canonicalHeaders,
    signedHeadersString,
    hashedPayload,
  ].join("\n");

  // Build string to sign
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = getHash(canonicalRequest);

  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  // Calculate signature
  const secretDate = sha256(date, "TC3" + authConfig.secretKey);
  const secretService = sha256(service, secretDate);
  const secretSigning = sha256("tc3_request", secretService);
  const signature = sha256(stringToSign, secretSigning, "hex");

  // Build authorization header
  const authorization = `TC3-HMAC-SHA256 Credential=${authConfig.secretId}/${credentialScope}, SignedHeaders=${signedHeadersString}, Signature=${signature}`;

  // Return all required headers
  const resultHeaders: Record<string, string | number> = {
    Authorization: authorization,
  };

  // Add all headers from headersToSign to the result
  for (const [key, value] of headersToSign.entries()) {
    // Convert header keys to proper format (e.g., x-tc-action to X-TC-Action)
    const formattedKey = key
      .split("-")
      .map((part) => {
        if (part === "tc") {
          return "TC";
        }
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join("-");

    resultHeaders[formattedKey] = value;
  }

  Reflect.deleteProperty(resultHeaders, "X-TC-Service");

  return resultHeaders;
}

// Helper functions
function sha256(
  message: string,
  secret: string | Buffer,
  encoding?: string
): string {
  const hmac = createHmac("sha256", secret);
  return hmac.update(message).digest(encoding as any);
}

function getHash(message: string, encoding = "hex"): string {
  const hash = createHash("sha256");
  return hash.update(message).digest(encoding as any);
}

function getDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = ("0" + (date.getUTCMonth() + 1)).slice(-2);
  const day = ("0" + date.getUTCDate()).slice(-2);
  return `${year}-${month}-${day}`;
}
