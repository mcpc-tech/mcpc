/**
 * Configuration Builder
 * Generates MCP and MCPC configurations
 */

import type { MCPCConfig, MCPConfig, MCPServerConfig } from "./types.ts";
import { registryClient } from "./registry-client.ts";

/**
 * Build command and args from package information
 */
function getCommandAndArgs(pkg: any): { command: string; args: string[] } {
  const registryType = pkg.registryType;
  const identifier = pkg.identifier;
  const version = pkg.version;

  let command: string;
  let args: string[];

  switch (registryType) {
    case "npm":
      command = "npx";
      args = ["-y", `${identifier}@${version}`];
      break;

    case "pypi":
      command = "uvx";
      args = [`${identifier}==${version}`];
      break;

    case "nuget":
      command = "dotnet";
      args = ["tool", "run", identifier, "--version", version];
      break;

    case "oci":
      // OCI containers (Docker)
      command = pkg.runtimeHint || "docker";
      args = [];

      // Add runtime arguments if provided
      if (pkg.runtimeArguments && pkg.runtimeArguments.length > 0) {
        pkg.runtimeArguments.forEach((runtimeArg: any) => {
          // Handle positional runtime arguments (e.g., "run" command)
          if (runtimeArg.type === "positional") {
            if (runtimeArg.value) {
              // Skip special hints that will be handled separately
              if (
                runtimeArg.valueHint === "env_var_name" ||
                runtimeArg.valueHint === "image_name"
              ) {
                return;
              }
              args.push(runtimeArg.value);
            }
          } // Handle named runtime arguments (flags)
          else if (runtimeArg.type === "named") {
            // Skip -e flag, will be added with environment variables
            if (runtimeArg.name === "-e") {
              return;
            }

            args.push(runtimeArg.name);

            // Handle value with variables (e.g., --mount with {source_path})
            if (runtimeArg.value) {
              let value = runtimeArg.value;

              // Replace variables with placeholders
              if (runtimeArg.variables) {
                Object.keys(runtimeArg.variables).forEach((varName) => {
                  const varConfig = runtimeArg.variables[varName];
                  const placeholder = varConfig.default ||
                    `$${varName.toUpperCase()}`;
                  value = value.replace(`{${varName}}`, placeholder);
                });
              }

              args.push(value);
            }
          }
        });
      } else {
        // Default runtime arguments if none provided
        args.push("run", "-i", "--rm");
      }

      // Add environment variables with -e flags
      if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
        pkg.environmentVariables.forEach((envVar: any) => {
          if (envVar.isRequired) {
            // Add -e flag with just the variable name (value comes from env field)
            args.push("-e", envVar.name);
          }
        });
      }

      // Add the container image
      args.push(identifier);

      // Add package arguments (commands to run inside container)
      if (pkg.packageArguments && pkg.packageArguments.length > 0) {
        pkg.packageArguments.forEach((pkgArg: any) => {
          if (pkgArg.type === "positional" && pkgArg.value) {
            args.push(pkgArg.value);
          } else if (pkgArg.type === "named") {
            if (pkgArg.name) {
              args.push(pkgArg.name);
              if (pkgArg.default) {
                args.push(pkgArg.default);
              } else if (pkgArg.value) {
                args.push(pkgArg.value);
              }
            }
          }
        });
      }
      break;

    default:
      // Unsupported registry types (like mcpb) should be handled elsewhere
      // Fallback to npx for unknown types
      command = "npx";
      args = ["-y", `${identifier}@${version}`];
      break;
  }

  // Add packageArguments for non-OCI types (OCI handles them separately above)
  if (registryType !== "oci" && pkg.packageArguments) {
    for (const arg of pkg.packageArguments) {
      if (arg.type === "positional" && arg.value) {
        args.push(arg.value);
      } else if (arg.type === "named") {
        if (arg.name && arg.default) {
          args.push(arg.name, arg.default);
        } else if (arg.name && arg.value) {
          args.push(arg.name, arg.value);
        }
      }
    }
  }

  return { command, args };
}

/**
 * Build headers for remote servers
 * Generates placeholders for required headers - users fill them in after config generation
 */
function buildRemoteHeaders(remote: any): Record<string, string> {
  const headers: Record<string, string> = {};

  if (!remote.headers || !Array.isArray(remote.headers)) {
    return headers;
  }

  remote.headers.forEach((header: any) => {
    // Check if we should populate this header
    const shouldPopulate = header.value || header.isRequired === true ||
      header.isSecret;

    if (!shouldPopulate) {
      return; // Skip optional headers without value template
    }

    if (header.value) {
      // Use provided value template - user should replace placeholders
      headers[header.name] = header.value;
    } else {
      // Generate placeholder for required or secret headers without value template
      // Use $VAR_NAME syntax (compatible with CLI runtime replacement)
      if (header.name.toLowerCase().includes("authorization")) {
        headers[header.name] = "Bearer $API_KEY";
      } else {
        headers[header.name] = "$" + header.name.toUpperCase().replace(
          /-/g,
          "_",
        );
      }
    }
  });

  return headers;
}

/**
 * Build MCP server configuration from server details
 * Generates configuration with placeholders - users fill them in after generation
 */
function buildMCPServerConfig(details: any): MCPServerConfig {
  // Handle remote servers (SSE/HTTP)
  if (details.remote) {
    const remote = details.remote;
    const headers = buildRemoteHeaders(remote);

    return {
      transportType: remote.type as "sse" | "streamable-http",
      url: remote.url,
      ...(Object.keys(headers).length > 0 && { headers }),
    };
  }

  // Handle stdio servers
  if (!details.package) {
    throw new Error(
      `Server ${details.name} doesn't have package or remote information`,
    );
  }

  const { command, args } = getCommandAndArgs(details.package);

  // Build environment variables with placeholders for required vars
  const env: Record<string, string> = {};

  // Add placeholders for required environment variables (not default values)
  if (details.package.environmentVariables) {
    details.package.environmentVariables.forEach((envVar: any) => {
      if (envVar.isRequired) {
        // Generate placeholder for required vars (use $VAR_NAME syntax for CLI compatibility)
        env[envVar.name] = "$" + envVar.name;
      }
    });
  }

  return {
    transportType: "stdio",
    command,
    args,
    ...(Object.keys(env).length > 0 && { env }),
  };
}

export class ConfigBuilder {
  /**
   * Compose a simple MCP configuration for Claude Desktop
   * Generates configuration with placeholders ($VAR_NAME) that users fill in manually
   */
  async composeSimpleMCPConfig(
    serverNames: string[],
  ): Promise<MCPConfig> {
    const mcpServers: MCPConfig["mcpServers"] = {};

    for (const serverName of serverNames) {
      try {
        const details = await registryClient.getServerDetails(serverName);

        mcpServers[serverName] = buildMCPServerConfig(details);
      } catch (error) {
        console.error(`Error adding server ${serverName}:`, error);
        throw error;
      }
    }

    return { mcpServers };
  }

  /**
   * Compose an MCPC (agentic) configuration
   * Generates configuration with placeholders ($VAR_NAME) that users fill in manually
   * Returns both the config and a list of required environment variables/headers
   */
  async composeMCPCConfig(
    serverName: string,
    toolName: string,
    description: string,
    serverDeps: string[],
    toolSelection: Array<{
      serverName: string;
      tools: string[] | "__ALL__";
    }>,
    options?: {
      mode?: "agentic" | "agentic_workflow";
      enableSampling?: boolean;
    },
  ): Promise<{
    config: MCPCConfig;
    requiredVars: Array<{
      serverName: string;
      type: "env" | "header";
      name: string;
      description?: string;
      isSecret?: boolean;
    }>;
  }> {
    const mcpServers: MCPCConfig["agents"][0]["deps"]["mcpServers"] = {};
    const requiredVars: Array<{
      serverName: string;
      type: "env" | "header";
      name: string;
      description?: string;
      isSecret?: boolean;
    }> = [];

    // Build tool references for the description
    const toolReferences: string[] = [];

    for (const depServerName of serverDeps) {
      try {
        const details = await registryClient.getServerDetails(depServerName);

        mcpServers[depServerName] = buildMCPServerConfig(details);

        // Collect required environment variables
        if (details.package?.environmentVariables) {
          details.package.environmentVariables.forEach((envVar: any) => {
            if (envVar.isRequired) {
              requiredVars.push({
                serverName: depServerName,
                type: "env",
                name: envVar.name,
                description: envVar.description,
                isSecret: envVar.isSecret,
              });
            }
          });
        }

        // Collect required headers for remote servers
        if (details.remote?.headers) {
          details.remote.headers.forEach((header: any) => {
            const shouldPopulate = header.value || header.isRequired === true ||
              header.isSecret;
            if (shouldPopulate && !header.value) {
              requiredVars.push({
                serverName: depServerName,
                type: "header",
                name: header.name,
                description: header.description,
                isSecret: header.isSecret,
              });
            }
          });
        }

        // Add tool references from capabilities with selection support
        if (details.capabilities?.tools) {
          const serverToolSelection = toolSelection.find(
            (sel) => sel.serverName === depServerName,
          );

          if (!serverToolSelection) {
            throw new Error(
              `Tool selection not specified for server '${depServerName}'. Please provide toolSelection for all servers.`,
            );
          }

          // User specified tool selection for this server
          if (serverToolSelection.tools === "__ALL__") {
            // Include all tools

            toolReferences.push(
              `<tool name="${depServerName}.__ALL__"/>`,
            );
          } else {
            // Include only selected tools
            for (const toolName of serverToolSelection.tools) {
              const tool = details.capabilities.tools.find(
                (t) => t.name === toolName,
              );
              if (tool) {
                toolReferences.push(
                  `<tool name="${depServerName}.${tool.name}"/>`,
                );
              } else {
                console.warn(
                  `Tool '${toolName}' not found in server '${depServerName}'`,
                );
              }
            }
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
      config: {
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
      },
      requiredVars,
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
