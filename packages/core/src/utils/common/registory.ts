import type { JsonSchema } from "json-schema-to-zod";
import type { z } from "zod";
import type { StreamableHTTPSchema } from "../../service/tools.ts";

export interface SmitheryConfig {
  type: "http";
  deploymentUrl: string;
  configSchema: JsonSchema;

  // Extended
  config?: any;
  smitheryApiKey?: string;
}

/**
 * Smithery: Connecting to Remote Servers
 */
export function connectToSmitheryServer(smitheryConfig: SmitheryConfig) {
  // Create server URL
  const serverUrl = new URL(smitheryConfig.deploymentUrl);

  // Add config and API key to URL
  // btoa() converts the JSON string to base64 for safe URL transmission
  serverUrl.searchParams.set(
    "config",
    btoa(JSON.stringify(smitheryConfig.config)),
  );
  serverUrl.searchParams.set(
    "api_key",
    smitheryConfig?.smitheryApiKey ?? smitheryConfig?.config?.smitheryApiKey,
  );

  return { url: serverUrl.toString() } as z.infer<typeof StreamableHTTPSchema>;
}

/**
 * Converts tool names between different formats
 * e.g. toolbox_search_servers -> @smithery/toolbox.search_servers
 */
export function smitheryToolNameCompatibale(name: string, scope: string) {
  if (!name.startsWith("toolbox_")) {
    return { toolNameWithScope: `${scope}.${name}`, toolName: name };
  }
  const [, ...toolNames] = name.split("_");
  const toolName = toolNames.join("_");
  const toolNameWithScope = `${scope}.${toolName}`;
  return { toolNameWithScope, toolName };
}
