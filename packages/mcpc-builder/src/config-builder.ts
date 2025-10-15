/**
 * Configuration Builder
 * Generates MCP and MCPC configurations
 */

import type { MCPCConfig, MCPConfig } from "./types.ts";
import { registryClient } from "./registry-client.ts";

export class ConfigBuilder {
  /**
   * Compose a simple MCP configuration for Claude Desktop
   */
  async composeSimpleMCPConfig(
    serverNames: string[],
    userConfigs?: Record<string, Record<string, string>>,
  ): Promise<MCPConfig> {
    const mcpServers: MCPConfig["mcpServers"] = {};

    for (const serverName of serverNames) {
      try {
        const details = await registryClient.getServerDetails(serverName);

        if (!details.package) {
          throw new Error(
            `Server ${serverName} doesn't have package information`,
          );
        }

        // Build command from package info
        const pkg = details.package;
        let command = "npx";
        let args = ["-y", pkg.identifier];

        // Adjust for different registry types
        if (pkg.registryType === "deno") {
          command = "deno";
          args = ["run", "--allow-all", `jsr:${pkg.identifier}`];
        }

        mcpServers[serverName] = {
          command,
          args,
          ...(userConfigs?.[serverName] && { env: userConfigs[serverName] }),
        };
      } catch (error) {
        console.error(`Error adding server ${serverName}:`, error);
        throw error;
      }
    }

    return { mcpServers };
  }

  /**
   * Compose an MCPC (agentic) configuration
   */
  async composeMCPCConfig(
    serverName: string,
    toolName: string,
    description: string,
    serverDeps: string[],
    options?: {
      mode?: "agentic" | "agentic_workflow";
      enableSampling?: boolean;
      userConfigs?: Record<string, Record<string, string>>;
    },
  ): Promise<MCPCConfig> {
    const mcpServers: MCPCConfig["agents"][0]["deps"]["mcpServers"] = {};

    // Build tool references for the description
    const toolReferences: string[] = [];

    for (const depServerName of serverDeps) {
      try {
        const details = await registryClient.getServerDetails(depServerName);

        if (!details.package) {
          throw new Error(
            `Server ${depServerName} doesn't have package information`,
          );
        }

        // Build command from package info
        const pkg = details.package;
        let command = "npx";
        let args = ["-y", pkg.identifier];

        // Adjust for different registry types
        if (pkg.registryType === "deno") {
          command = "deno";
          args = ["run", "--allow-all", `jsr:${pkg.identifier}`];
        }

        mcpServers[depServerName] = {
          command,
          args,
          ...(options?.userConfigs?.[depServerName] && {
            env: options.userConfigs[depServerName],
          }),
        };

        // Add tool references from capabilities
        if (details.capabilities?.tools) {
          for (const tool of details.capabilities.tools) {
            toolReferences.push(
              `<tool name="${depServerName}.${tool.name}"/>`,
            );
          }
        }
      } catch (error) {
        console.error(
          `Error adding server dependency ${depServerName}:`,
          error,
        );
        throw error;
      }
    }

    // Enhanced description with tool references
    const enhancedDescription = `${description}

Available tools:
${toolReferences.join("\n")}`;

    return {
      name: serverName,
      version: "1.0.0",
      agents: [
        {
          name: toolName,
          description: enhancedDescription,
          deps: { mcpServers },
          options: {
            mode: options?.mode || "agentic",
            ...(options?.enableSampling && { sampling: true }),
          },
        },
      ],
    };
  }

  /**
   * Get environment variable requirements for servers
   */
  async getEnvVarSchemas(serverNames: string[]): Promise<Record<string, any>> {
    return await registryClient.getEnvVarSchemas(serverNames);
  }
}

export const configBuilder: ConfigBuilder = new ConfigBuilder();
