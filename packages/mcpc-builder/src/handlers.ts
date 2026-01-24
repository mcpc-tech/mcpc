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
              : "⚠️ All tools included by default (tools not pre-fetched, may need authentication)";

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
        const { config: result, requiredVars } = await configBuilder
          .composeMCPCConfig(
            args.serverName,
            args.toolName,
            args.description,
            args.serverDeps,
            args.toolSelection,
            {
              mode: args.mode,
              enableSampling: args.enableSampling,
              samplingConfig: args.samplingConfig,
              maxSteps: args.maxSteps,
              maxTokens: args.maxTokens,
              tracingEnabled: args.tracingEnabled,
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
          args: ["-y", "@mcpc-tech/cli@latest", "--config-file", absolutePath],
        };
        const mcpServerJson = JSON.stringify(mcpServerDef);

        // Create directory if it doesn't exist and write file
        mkdirSync(mcpcDir, { recursive: true });
        writeFileSync(absolutePath, JSON.stringify(result, null, 2));

        // Build environment variables section
        let envVarsSection = "";
        if (requiredVars.length > 0) {
          // Group by server
          const varsByServer = new Map<string, typeof requiredVars>();
          requiredVars.forEach((v) => {
            if (!varsByServer.has(v.serverName)) {
              varsByServer.set(v.serverName, []);
            }
            varsByServer.get(v.serverName)!.push(v);
          });

          envVarsSection = `## ⚠️ Required Configuration

The following variables need to be configured in the generated config file (\`${absolutePath}\`):

`;
          varsByServer.forEach((vars, serverName) => {
            envVarsSection += `### ${serverName}\n\n`;
            vars.forEach((v) => {
              const typeLabel = v.type === "env"
                ? "Environment Variable"
                : "Header";
              const secretLabel = v.isSecret ? " 🔒 (Secret)" : "";
              envVarsSection +=
                `- **\`${v.name}\`** (${typeLabel})${secretLabel}\n`;
              if (v.description) {
                envVarsSection += `  ${v.description}\n`;
              }
              envVarsSection +=
                `  Current placeholder: \`$${v.name}\` - Replace with actual value\n\n`;
            });
          });

          envVarsSection += `\n**Steps to configure:**
1. Open \`${absolutePath}\`
2. Find all \`$VARIABLE_NAME\` placeholders
3. Replace them with actual values
4. Save the file

**Example:**
\`\`\`json
"env": {
  "GITHUB_TOKEN": "$GITHUB_TOKEN"  // ← Replace $GITHUB_TOKEN with your actual token
}
\`\`\`

`;
        } else {
          envVarsSection =
            "## ✅ No Configuration Required\n\nThis server composition doesn't require any environment variables or API keys.\n\n";
        }

        // Build the response with command and installation instructions
        const response = `# MCPC Configuration Generated

✅ Configuration saved to \`${absolutePath}\`

${envVarsSection}
## Install in Your Editor

### VS Code

\`\`\`bash
code --add-mcp '${mcpServerJson}'
\`\`\`

### Cursor

**Note**: Cursor's \`--add-mcp\` command currently has a JSON parsing issue. Please use manual configuration instead (see below).

### Claude Code

\`\`\`bash
claude mcp add --transport stdio ${args.serverName} -- npx -y @mcpc-tech/cli@latest --config-file ${absolutePath}
\`\`\`

### Codex

\`\`\`bash
codex mcp add ${args.serverName} -- npx -y @mcpc-tech/cli@latest --config-file ${absolutePath}
\`\`\`

### Gemini

\`\`\`bash
gemini mcp add ${args.serverName} npx -y @mcpc-tech/cli@latest --config-file ${absolutePath}
\`\`\`

## Alternative: JSON File Configuration

\`\`\`json
${JSON.stringify(mcpServerDef, null, 2)}
\`\`\`
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
