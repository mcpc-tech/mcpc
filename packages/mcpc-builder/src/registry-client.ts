/**
 * Registry Client for mcpc.tech API
 */

import type { SearchResult, ServerDetails } from "./types.ts";

const API_BASE_URL = "https://mcpc.tech";

export class RegistryClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Search for MCP servers in the registry
   * Searches by server name and tool name, returning the union of results
   */
  async searchServers(
    serverQuery: string,
    toolQuery: string,
    limit: number = 20,
  ): Promise<SearchResult> {
    try {
      const mergedMap = new Map<string, any>();

      // Search by server name
      const serverUrl = new URL("/server-capabilities", this.baseUrl);
      serverUrl.searchParams.set("q", serverQuery);
      serverUrl.searchParams.set("limit", limit.toString());

      const serverResponse = await fetch(serverUrl.toString());
      if (serverResponse.ok) {
        const serverData = await serverResponse.json();
        const serverResults = serverData.servers || [];
        for (const server of serverResults) {
          mergedMap.set(server.name, server);
        }
      } else {
        // Ensure the response body is closed to avoid resource leaks detected by Deno tests
        try {
          if (serverResponse.body) {
            await serverResponse.body.cancel();
          }
        } catch (_) {
          // ignore cancel errors
        }
      }

      // Search by tool name
      const toolUrl = new URL("/server-capabilities", this.baseUrl);
      toolUrl.searchParams.set("tool", toolQuery);
      toolUrl.searchParams.set("limit", limit.toString());

      const toolResponse = await fetch(toolUrl.toString());
      if (toolResponse.ok) {
        const toolData = await toolResponse.json();
        const toolResults = toolData.servers || [];
        for (const server of toolResults) {
          if (!mergedMap.has(server.name)) {
            mergedMap.set(server.name, server);
          }
        }
      } else {
        // Ensure the response body is closed to avoid resource leaks detected by Deno tests
        try {
          if (toolResponse.body) {
            await toolResponse.body.cancel();
          }
        } catch (_) {
          // ignore cancel errors
        }
      }

      const mergedServers = Array.from(mergedMap.values()).slice(0, limit);

      return {
        servers: mergedServers,
        total: mergedMap.size,
        hasMore: mergedMap.size > limit,
      };
    } catch (error) {
      console.error("Error searching servers:", error);
      throw new Error(
        `Failed to search servers: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Get detailed information about a specific server
   */
  async getServerDetails(serverName: string): Promise<ServerDetails> {
    try {
      const url = new URL("/server-capabilities", this.baseUrl);
      url.searchParams.set("server", serverName);

      const response = await fetch(url.toString());
      if (!response.ok) {
        // Close body stream before throwing to avoid leaked response bodies
        try {
          if (response.body) {
            await response.body.cancel();
          }
        } catch (_) {
          // ignore cancel errors
        }

        if (response.status === 404) {
          throw new Error(`Server not found: ${serverName}`);
        }
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching server details:", error);
      throw new Error(
        `Failed to get server details: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Get server capabilities (tools, resources, prompts)
   * This is the same as getServerDetails since the API returns full data
   */
  getServerCapabilities(serverName: string): Promise<any> {
    return this.getServerDetails(serverName);
  }

  /**
   * Get environment variable schemas for multiple servers
   */
  async getEnvVarSchemas(serverNames: string[]): Promise<Record<string, any>> {
    try {
      const results: Record<string, any> = {};

      for (const name of serverNames) {
        const server = await this.getServerDetails(name);
        console.error("Fetched env vars for", name, server);
        results[name] = server.package?.environmentVariables || [];
      }

      return results;
    } catch (error) {
      console.error("Error fetching env var schemas:", error);
      throw new Error(
        `Failed to get env var schemas: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export const registryClient: RegistryClient = new RegistryClient();
