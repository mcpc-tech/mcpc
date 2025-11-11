/** Configuration Loader for MCPC CLI
 *
 * This module provides utilities to load MCPC configuration from command-line arguments,
 * environment variables, or files.
 *
 * Command-line arguments:
 * - `--config <json>` - Inline JSON configuration string
 * - `--config-url <url>` - Fetch configuration from URL (e.g., GitHub raw)
 * - `--config-file <path>` - Path to configuration file
 * - No arguments - Uses ./mcpc.config.json if available
 *
 * Environment variables:
 * - `MCPC_CONFIG` - Inline JSON configuration string (same as --config)
 * - `MCPC_CONFIG_URL` - URL to fetch configuration from (same as --config-url)
 * - `MCPC_CONFIG_FILE` - Path to configuration file (same as --config-file)
 *
 * Priority order:
 * 1. --config (inline JSON)
 * 2. MCPC_CONFIG environment variable
 * 3. --config-url or MCPC_CONFIG_URL
 * 4. --config-file or MCPC_CONFIG_FILE
 * 5. ./mcpc.config.json (default)
 *
 * @example
 * ```bash
 * # Inline JSON config
 * deno run --allow-all src/bin.ts --config '[{"name":"my-agent","description":"..."}]'
 *
 * # Using environment variable
 * export MCPC_CONFIG='[{"name":"my-agent","description":"..."}]'
 * deno run --allow-all src/bin.ts
 *
 * # From URL
 * deno run --allow-all src/bin.ts --config-url https://example.com/config.json
 *
 * # From file
 * deno run --allow-all src/bin.ts --config-file ./my-config.json
 *
 * # Default (uses ./mcpc.config.json)
 * deno run --allow-all src/bin.ts
 * ```
 *
 * @module
 */

import type { ComposeDefinition } from "@mcpc/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

export interface MCPCConfig {
  /**
   * Server name
   */
  name?: string;
  /**
   * Server version
   */
  version?: string;
  /**
   * Server capabilities
   */
  capabilities?: {
    tools?: Record<string, unknown>;
    sampling?: Record<string, unknown>;
  };
  /**
   * Agent composition definitions
   */
  agents: ComposeDefinition[];
}

/**
 * Extract server name from command and arguments
 * Simply sanitizes the first non-flag argument or command name
 */
function extractServerName(command: string, commandArgs: string[]): string {
  // Try first non-flag argument
  for (const arg of commandArgs) {
    if (!arg.startsWith("-")) {
      const name = arg
        .replace(/[@.,/\\:;!?#$%^&*()[\]{}]/g, "_")
        .substring(0, 64);
      if (name) return name;
    }
  }

  // Fall back to command itself
  const name = command
    .replace(/[@.,/\\:;!?#$%^&*()[\]{}]/g, "_")
    .substring(0, 64);
  return name || "agentic-tool";
}

/**
 * Create proxy configuration from command-line arguments
 * This generates an MCPC config that wraps an existing MCP server
 */
function createProxyConfig(args: {
  transportType?: string;
  proxyCommand?: string[];
  mode?: string;
  name?: string;
}): MCPCConfig {
  if (!args.proxyCommand || args.proxyCommand.length === 0) {
    console.error("Error: --proxy requires a command after --");
    console.error(
      "Example: mcpc --proxy --transport-type stdio -- npx -y @wonderwhy-er/desktop-commander",
    );
    process.exit(1);
  }

  if (!args.transportType) {
    console.error("Error: --proxy requires --transport-type to be specified");
    console.error("Supported types: stdio, streamable-http, sse");
    console.error(
      "Example: mcpc --proxy --transport-type stdio -- npx -y @wonderwhy-er/desktop-commander",
    );
    process.exit(1);
  }

  const validTransports = ["stdio", "streamable-http", "sse"];
  if (!validTransports.includes(args.transportType)) {
    console.error(`Error: Invalid transport type '${args.transportType}'`);
    console.error(`Supported types: ${validTransports.join(", ")}`);
    process.exit(1);
  }

  const command = args.proxyCommand[0];
  const commandArgs = args.proxyCommand.slice(1);

  // Use custom name if provided, otherwise extract from command
  const serverName = args.name || extractServerName(command, commandArgs);

  // Create configuration
  const config: MCPCConfig = {
    name: `${serverName}-proxy`,
    version: "0.1.0",
    capabilities: {
      tools: {},
      sampling: {},
    },
    agents: [
      {
        name: serverName,
        description: `Orchestrate ${serverName} MCP server tools`,
        deps: {
          mcpServers: {
            [serverName]: {
              command: command,
              args: commandArgs,
              transportType: args.transportType as
                | "stdio"
                | "streamable-http"
                | "sse",
            },
          },
        },
        options: {
          mode: (args.mode || "agentic"),
          refs: [
            `<tool name="${serverName}.__ALL__"/>`,
          ],
        },
      },
    ],
  };

  console.error(`Created proxy configuration for ${serverName}`);
  console.error(`Transport: ${args.transportType}`);
  console.error(`Command: ${command} ${commandArgs.join(" ")}`);
  if (args.mode) {
    console.error(`Mode: ${args.mode}`);
  }

  return config;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
MCPC CLI - Model Context Protocol Composer

USAGE:
    mcpc [OPTIONS]

OPTIONS:
    --help, -h              Show this help message
    --config <json>         Inline JSON configuration string
    --config-url <url>      Fetch configuration from URL
    --config-file <path>    Load configuration from file path
    --request-headers <header>, -H <header>
                           Add custom HTTP header for URL fetching
                           Format: "Key: Value" or "Key=Value"
                           Can be used multiple times
    --mode <mode>           Set execution mode for all agents
                           Supported modes:
                           - agentic: Fully autonomous agent mode (default)
                           - agentic_workflow: Agent workflow mode with dynamic or predefined steps
                           - agentic_sampling: Autonomous sampling mode for agentic execution
                           - agentic_workflow_sampling: Autonomous sampling mode for workflow execution
                           - code_execution: Code execution mode for most efficient token usage
    --proxy                 Proxy mode: automatically configure MCPC to wrap an MCP server
                           Use with --transport-type to specify the transport
                           Example: --proxy --transport-type stdio -- npx -y @wonderwhy-er/desktop-commander
    --transport-type <type> Transport type for proxy mode
                           Supported types: stdio, streamable-http, sse
    --name <name>           Custom server name for proxy mode (overrides auto-detection)

ENVIRONMENT VARIABLES:
    MCPC_CONFIG            Inline JSON configuration (same as --config)
    MCPC_CONFIG_URL        URL to fetch config from (same as --config-url)
    MCPC_CONFIG_FILE       Path to config file (same as --config-file)

EXAMPLES:
    # Show help
    mcpc --help

    # Proxy mode - wrap an existing MCP server (stdio)
    mcpc --proxy --transport-type stdio -- npx -y @wonderwhy-er/desktop-commander

    # Proxy mode with custom server name
    mcpc --proxy --transport-type stdio --name my-server -- npx shadcn@latest mcp

    # Proxy mode - wrap an MCP server (streamable-http)
    mcpc --proxy --transport-type streamable-http -- https://api.example.com/mcp

    # Proxy mode - wrap an MCP server (sse)
    mcpc --proxy --transport-type sse -- https://api.example.com/sse

    # Load from URL
    mcpc --config-url \\
      "https://raw.githubusercontent.com/mcpc-tech/mcpc/main/packages/cli/examples/configs/codex-fork.json"

    # Load from URL with custom headers
    mcpc \\
      --config-url "https://api.example.com/config.json" \\
      -H "Authorization: Bearer token123" \\
      -H "X-Custom-Header: value"

    # Load from file
    mcpc --config-file ./my-config.json

    # Override execution mode for all agents
    mcpc --config-file ./my-config.json --mode agentic_workflow

    # Using environment variable
    export MCPC_CONFIG='[{"name":"agent","description":"..."}]'
    mcpc

    # Use default configuration (./mcpc.config.json)
    mcpc

CONFIGURATION:
    Configuration files support environment variable substitution using $VAR_NAME syntax.
    
    Priority order:
    1. --config (inline JSON)
    2. MCPC_CONFIG environment variable
    3. --config-url or MCPC_CONFIG_URL
    4. --config-file or MCPC_CONFIG_FILE
    5. ./mcpc.config.json (default)

For more information, visit: https://github.com/mcpc-tech/mcpc
`);
}

/**
 * Parse command-line arguments
 */
function parseArgs(): {
  config?: string;
  configUrl?: string;
  configFile?: string;
  requestHeaders?: Record<string, string>;
  help?: boolean;
  proxy?: boolean;
  transportType?: string;
  proxyCommand?: string[];
  mode?: string;
  name?: string;
} {
  const args = process.argv.slice(2);
  const result: {
    config?: string;
    configUrl?: string;
    configFile?: string;
    requestHeaders?: Record<string, string>;
    help?: boolean;
    proxy?: boolean;
    transportType?: string;
    proxyCommand?: string[];
    mode?: string;
    name?: string;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--config" && i + 1 < args.length) {
      result.config = args[++i];
    } else if (arg === "--config-url" && i + 1 < args.length) {
      result.configUrl = args[++i];
    } else if (arg === "--config-file" && i + 1 < args.length) {
      result.configFile = args[++i];
    } else if (
      (arg === "--request-headers" || arg === "-H") &&
      i + 1 < args.length
    ) {
      // Parse header in format "Key: Value" or "Key=Value"
      const headerStr = args[++i];
      const colonIdx = headerStr.indexOf(":");
      const equalIdx = headerStr.indexOf("=");
      const separatorIdx = colonIdx !== -1
        ? equalIdx !== -1 ? Math.min(colonIdx, equalIdx) : colonIdx
        : equalIdx;

      if (separatorIdx !== -1) {
        const key = headerStr.substring(0, separatorIdx).trim();
        const value = headerStr.substring(separatorIdx + 1).trim();
        if (!result.requestHeaders) {
          result.requestHeaders = {};
        }
        result.requestHeaders[key] = value;
      }
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--proxy") {
      result.proxy = true;
    } else if (arg === "--transport-type" && i + 1 < args.length) {
      result.transportType = args[++i];
    } else if (arg === "--mode" && i + 1 < args.length) {
      result.mode = args[++i];
    } else if (arg === "--name" && i + 1 < args.length) {
      result.name = args[++i];
    } else if (arg === "--") {
      // Everything after -- is the proxy command
      result.proxyCommand = args.slice(i + 1);
      break;
    }
  }

  return result;
}

/**
 * Load configuration from command-line arguments, environment variables, or default file
 * @returns Configuration object or null if no configuration found
 */
export async function loadConfig(): Promise<MCPCConfig | null> {
  const args = parseArgs();

  // Handle --help
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Handle --proxy mode
  if (args.proxy) {
    return createProxyConfig(args);
  }

  // Priority 1: --config (inline JSON string)
  if (args.config) {
    try {
      const parsed = JSON.parse(args.config);
      return applyModeOverride(normalizeConfig(parsed), args.mode);
    } catch (error) {
      console.error("Failed to parse --config argument:", error);
      throw error;
    }
  }

  // Priority 2: MCPC_CONFIG environment variable (for testing and scripting)
  if (process.env.MCPC_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.MCPC_CONFIG);
      return applyModeOverride(normalizeConfig(parsed), args.mode);
    } catch (error) {
      console.error("Failed to parse MCPC_CONFIG environment variable:", error);
      throw error;
    }
  }

  // Priority 3: --config-url or MCPC_CONFIG_URL (fetch from URL)
  const configUrl = args.configUrl || process.env.MCPC_CONFIG_URL;
  if (configUrl) {
    try {
      const headers: HeadersInit = {
        "User-Agent": "MCPC-CLI/0.1.0",
        ...args.requestHeaders,
      };
      const response = await fetch(configUrl, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const content = await response.text();
      const parsed = JSON.parse(content);
      return applyModeOverride(normalizeConfig(parsed), args.mode);
    } catch (error) {
      console.error(`Failed to fetch config from ${configUrl}:`, error);
      throw error;
    }
  }

  // Priority 4: --config-file or MCPC_CONFIG_FILE (file path)
  const configFile = args.configFile || process.env.MCPC_CONFIG_FILE;
  if (configFile) {
    try {
      const content = await readFile(configFile, "utf-8");
      const parsed = JSON.parse(content);
      return applyModeOverride(normalizeConfig(parsed), args.mode);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(`Config file not found: ${configFile}`);
        throw error;
      } else {
        console.error(`Failed to load config from ${configFile}:`, error);
        throw error;
      }
    }
  }

  // Priority 5: ./mcpc.config.json in current directory
  const defaultConfigPath = resolve(process.cwd(), "mcpc.config.json");
  try {
    const content = await readFile(defaultConfigPath, "utf-8");
    const parsed = JSON.parse(content);
    return applyModeOverride(normalizeConfig(parsed), args.mode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // No config file found, this is okay
      return null;
    } else {
      console.error(`Failed to load config from ${defaultConfigPath}:`, error);
      throw error;
    }
  }
}

/**
 * Replace environment variable references in a string
 * Supports $VAR_NAME syntax
 */
function replaceEnvVars(str: string): string {
  return str.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_match, varName) => {
    return process.env[varName] || "";
  });
}

/**
 * Recursively replace environment variables in configuration object
 */
function replaceEnvVarsInConfig(obj: unknown): unknown {
  if (typeof obj === "string") {
    return replaceEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => replaceEnvVarsInConfig(item));
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceEnvVarsInConfig(value);
    }
    return result;
  }
  return obj;
}

/**
 * Apply mode override to all agents in the configuration
 */
function applyModeOverride(config: MCPCConfig, mode?: string): MCPCConfig {
  if (!mode) return config;

  // Apply mode to all agents
  config.agents.forEach((agent) => {
    if (!agent.options) agent.options = {};
    agent.options.mode = mode as any;
  });

  return config;
}

/**
 * Normalize configuration to ensure it has the expected structure
 * Supports both array format (legacy) and object format (new)
 */
function normalizeConfig(config: unknown): MCPCConfig {
  // Replace environment variables first
  config = replaceEnvVarsInConfig(config);

  // If config is an array, treat it as agents array
  if (Array.isArray(config)) {
    return {
      name: "mcpc-server",
      version: "0.1.0",
      agents: normalizeAgents(config as ComposeDefinition[]),
    };
  }

  // If config is an object, validate structure
  if (config && typeof config === "object") {
    const cfg = config as Partial<MCPCConfig>;
    return {
      name: cfg.name || "mcpc-server",
      version: cfg.version || "0.1.0",
      capabilities: cfg.capabilities,
      agents: normalizeAgents(cfg.agents || []),
    };
  }

  throw new Error("Invalid configuration format");
}

/**
 * Normalize agents to ensure deps structure is correct
 */
function normalizeAgents(agents: ComposeDefinition[]): ComposeDefinition[] {
  return agents.map((agent) => {
    // Ensure deps has proper structure if it exists
    if (agent.deps && !agent.deps.mcpServers) {
      agent.deps.mcpServers = {};
    }
    return agent;
  });
}

/**
 * Validate configuration structure
 */
export function validateConfig(config: MCPCConfig): void {
  if (!config.agents || !Array.isArray(config.agents)) {
    throw new Error("Configuration must include an 'agents' array");
  }

  for (const agent of config.agents) {
    if (agent.name === undefined) {
      throw new Error("Each agent must have a 'name' property");
    }
  }
}
