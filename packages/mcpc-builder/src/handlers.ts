/**
 * Tool call handlers for MCPC Builder
 */

import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { registryClient } from "./registry-client.ts";
import { configBuilder } from "./config-builder.ts";
import {
  composeMCPCConfigSchema,
  getEnvVarSchemasSchema,
  searchServersSchema,
} from "./schemas.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";

export async function handleToolCall(request: CallToolRequest): Promise<any> {
  try {
    switch (request.params.name) {
      case "search_mcp_servers": {
        const args = searchServersSchema.parse(request.params.arguments);
        const result = await registryClient.searchServers(
          args.serverQuery,
          args.toolQuery,
          args.limit,
        );

        // Format as table
        let formatted = `Found ${result.total} server(s)${
          result.hasMore ? " (showing first " + result.servers.length + ")" : ""
        }:\n\n`;

        if (result.servers.length === 0) {
          formatted += "No servers found matching your query.";
        } else {
          // Table header
          formatted += "| Server Name | Description | Available Tools |\n";
          formatted += "|-------------|-------------|----------------|\n";

          // Table rows
          for (const server of result.servers) {
            const name = server.name;
            const desc = server.description;
            const toolNames = server.toolNames || [];
            const tools = toolNames.length > 0
              ? toolNames.join(", ")
              : "No tools";

            formatted += `| ${name} | ${desc} | ${tools} |\n`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: formatted,
            },
          ],
        };
      }

      case "compose_mcpc_config": {
        const args = composeMCPCConfigSchema.parse(request.params.arguments);
        const result = await configBuilder.composeMCPCConfig(
          args.serverName,
          args.toolName,
          args.description,
          args.serverDeps,
          {
            mode: args.mode,
            enableSampling: args.enableSampling,
            userConfigs: args.userConfigs,
          },
        );

        // Generate file paths using absolute path
        const homeDir = process.env.HOME || process.env.USERPROFILE || "~";
        const configFileName = `${args.serverName}.json`;
        const mcpcDir = `${homeDir}/.mcpc`;
        const absolutePath = `${mcpcDir}/${configFileName}`;

        // Generate MCP server definition for CLI commands (using file reference)
        const mcpServerDef = {
          name: args.serverName,
          command: "npx",
          args: ["-y", "@mcpc-tech/cli", "--config-file", absolutePath],
        };
        const mcpServerJson = JSON.stringify(mcpServerDef);

        // Create directory if it doesn't exist and write file
        mkdirSync(mcpcDir, { recursive: true });
        writeFileSync(absolutePath, JSON.stringify(result, null, 2));

        // Build environment variable flags
        const envFlags =
          args.userConfigs && Object.keys(args.userConfigs).length > 0
            ? Object.entries(args.userConfigs).flatMap(([_server, vars]) =>
              Object.entries(vars as Record<string, string>).map(([key, val]) =>
                `--env ${key}=${val}`
              )
            ).join(" ")
            : "";

        // Build the response with command and installation instructions
        const response = `# MCPC Configuration Generated

✅ Configuration saved to \`${absolutePath}\`

## Install in Your Editor

### VS Code

\`\`\`bash
code --add-mcp '${mcpServerJson}'
\`\`\`

### Cursor

**Note**: Cursor's \`--add-mcp\` command currently has a JSON parsing issue. Please use manual configuration instead (see below).

### Claude Code

\`\`\`bash
claude mcp add --transport stdio ${args.serverName}${
          envFlags ? " " + envFlags : ""
        } -- npx -y @mcpc-tech/cli --config-file ${absolutePath}
\`\`\`

### Codex

\`\`\`bash
codex mcp add ${args.serverName}${
          envFlags ? " " + envFlags : ""
        } -- npx -y @mcpc-tech/cli --config-file ${absolutePath}
\`\`\`

### Gemini

\`\`\`bash
gemini mcp add ${args.serverName} npx -y @mcpc-tech/cli --config-file ${absolutePath}
\`\`\`

## Alternative: JSON File Configuration

\`\`\`json
${JSON.stringify(mcpServerJson, null, 2)}
\`\`\`

## Environment Variables

${
          args.userConfigs && Object.keys(args.userConfigs).length > 0
            ? `Make sure to set these environment variables:\n\n${
              Object.entries(args.userConfigs).map(([server, vars]) =>
                `**${server}**:\n${
                  Object.entries(vars as Record<string, string>).map(([
                    key,
                    val,
                  ]) => `- \`${key}=${val}\``)
                    .join("\n")
                }`
              ).join("\n\n")
            }`
            : "No environment variables required."
        }
`;

        return {
          content: [
            {
              type: "text",
              text: response,
            },
          ],
        };
      }

      case "get_env_var_schemas": {
        const args = getEnvVarSchemasSchema.parse(request.params.arguments);
        const result = await configBuilder.getEnvVarSchemas(args.serverNames);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}
