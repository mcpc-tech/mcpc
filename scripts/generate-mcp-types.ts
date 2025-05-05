import axios from "npm:axios";
import * as fs from "node:fs";
import * as path from "node:path";

interface ServerListResponse {
  servers: Array<{
    qualifiedName: string;
    displayName: string;
    description: string;
    homepage: string;
    useCount: string;
    isDeployed: boolean;
    createdAt: string;
  }>;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

interface ServerDetailsResponse {
  qualifiedName: string;
  displayName: string;
  remote: boolean;
  iconUrl: string | null;
  deploymentUrl: string | null;
  configSchema: any;
  connections: Array<{
    type: string;
    url?: string;
    configSchema: any;
  }>;
  security: {
    scanPassed: boolean;
  } | null;
  tools: Array<{
    name: string;
    description: string | null;
  }> | null;
}

async function generateMCPTypes(apiToken: string): Promise<void> {
  try {
    // Set up axios with authentication
    const api = axios.create({
      baseURL: "https://registry.smithery.ai",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Fetching deployed MCP servers...");

    // Get all deployed servers
    const listResponse = await api.get<ServerListResponse>("/servers", {
      params: {
        q: "is:deployed",
        pageSize: 5,
      },
    });

    const deployedServers = listResponse.data.servers;
    console.log(`Found ${deployedServers.length} deployed servers`);

    // Collect all tools from all servers
    const allTools = new Set<string>();
    const serverDetails: Record<string, ServerDetailsResponse> = {};

    // Fetch details for each server
    for (const server of deployedServers) {
      console.log(`Fetching details for ${server.qualifiedName}...`);
      try {
        const detailsResponse = await api.get<ServerDetailsResponse>(
          `/servers/${server.qualifiedName}`
        );
        const details = detailsResponse.data;
        serverDetails[server.qualifiedName] = details;
        console.log({ server, details });

        // Add tools to the set
        if (details.tools) {
          details.tools.forEach((tool) => {
            allTools.add(tool.name);
          });
        }
      } catch (error) {
        console.error(
          `Error fetching details for ${server.qualifiedName}:`,
          error
        );
      }
    }

    // Generate TypeScript types
    let typesContent = `/**
 * AUTO-GENERATED MCP Types
 * Generated on: ${new Date().toISOString()}
 * 
 * This file contains TypeScript types for MCP servers and tools
 * based on data from the Smithery Registry API.
 */

/**
 * All available MCP tools organized by server
 */
export const MCP_TOOLS = {
${Object.entries(serverDetails)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([serverName, details]) => {
    const serverKey = serverName.replace(/-/g, "_");
    const toolsObj = details.tools
      ? `{
    ${details.tools
      .map((tool) => {
        // Add JSDoc comment with description if available
        const description = tool.description
          ? `/**\n     * ${tool.description}\n     */\n    `
          : "";
        return `${description}"${tool.name}": "${tool.name}"`;
      })
      .join(",\n    ")}
  }`
      : "{}";
    return `  "${serverKey}": ${toolsObj}`;
  })
  .join(",\n")}
} as const;

/**
 * All available tool names across all servers
 */
export const ALL_MCP_TOOLS = {
${Array.from(allTools)
  .sort()
  .map((tool) => `  ${tool}: "${tool}"`)
  .join(",\n")}
} as const;

export type MCPToolName = typeof ALL_MCP_TOOLS[keyof typeof ALL_MCP_TOOLS];

/**
 * Interface for MCP tool information
 */
export interface MCPTool {
  name: MCPToolName;
  description: string | null;
}

/**
 * All available MCP servers
 */
export const MCP_SERVERS = {
${Object.keys(serverDetails)
  .sort()
  .map((name) => `  "${name.replace(/-/g, "_")}": "${name}"`)
  .join(",\n")}
} as const;

export type MCPServerName = typeof MCP_SERVERS[keyof typeof MCP_SERVERS];

/**
 * Server details with their available tools
 */
export const MCP_SERVER_TOOLS: Record<MCPServerName, MCPToolName[]> = {
${Object.entries(serverDetails)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, details]) => {
    const toolNames =
      details.tools?.map((t) => `ALL_MCP_TOOLS["${t.name}"]`).join(", ") || "";
    return `  [MCP_SERVERS["${name.replace(/-/g, "_")}"]]: [${toolNames}]`;
  })
  .join(",\n")}
};

/**
 * Helper function to check if a server supports a specific tool
 */
export function serverSupportsTool(serverName: MCPServerName, toolName: MCPToolName): boolean {
  return MCP_SERVER_TOOLS[serverName].includes(toolName);
}
`;

    // Write the types to a file
    const outputPath = path.join(process.cwd(), "src", "mcp-types.ts");
    fs.writeFileSync(outputPath, typesContent);
    console.log(`MCP types generated successfully at ${outputPath}`);
  } catch (error) {
    console.error("Error generating MCP types:", error);
    process.exit(1);
  }
}

// Check if API token is provided
const apiToken = process.env.SMITHERY_API_TOKEN;
if (!apiToken) {
  console.error("Error: SMITHERY_API_TOKEN environment variable is required");
  process.exit(1);
}

// Run the generator
generateMCPTypes(apiToken);
