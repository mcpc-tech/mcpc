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
 * 5. ~/.mcpc/config.json (user config)
 * 6. ./mcpc.config.json (local config)
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
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

interface ServerSpec {
  command: string;
  args: string[];
  transportType: "stdio" | "streamable-http" | "sse";
}

/**
 * Get the path to the user's config directory (~/.mcpc)
 */
function getUserConfigDir(): string {
  return join(homedir(), ".mcpc");
}

/**
 * Get the path to the user's saved config file (~/.mcpc/config.json)
 */
function getUserConfigPath(): string {
  return join(getUserConfigDir(), "config.json");
}

/**
 * Save configuration to user's config file (~/.mcpc/config.json)
 * Merges new agent if name differs, warns if name conflicts
 */
async function saveUserConfig(
  config: MCPCConfig,
  newAgentName: string,
): Promise<void> {
  const configPath = getUserConfigPath();
  const configDir = dirname(configPath);

  try {
    // Try to load existing config
    let existingConfig: MCPCConfig | null = null;
    try {
      const content = await readFile(configPath, "utf-8");
      existingConfig = JSON.parse(content);
    } catch {
      // File doesn't exist - will create new one
    }

    // Handle existing config
    if (existingConfig) {
      const hasConflict = existingConfig.agents.some(
        (agent) => agent.name === newAgentName,
      );

      if (hasConflict) {
        console.error(
          `\n⚠ Agent "${newAgentName}" already exists in ${configPath}\n` +
            `  Use --name to choose a different name, or delete the existing agent first.\n`,
        );
        return;
      }

      // Merge new agent
      existingConfig.agents.push(...config.agents);
      await writeFile(
        configPath,
        JSON.stringify(existingConfig, null, 2),
        "utf-8",
      );
      console.error(
        `\n✓ Added agent "${newAgentName}" (total: ${existingConfig.agents.length})\n` +
          `  Config: ${configPath}\n` +
          `  Run: mcpc\n`,
      );
      return;
    }

    // Create new config
    await mkdir(configDir, { recursive: true });
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
    console.error(
      `\n✓ Configuration saved to: ${configPath}\n` +
        `  Run: mcpc\n`,
    );
  } catch (error) {
    console.error(`Failed to save config to ${configPath}:`, error);
  }
}

/**
 * Create wrap configuration from command-line arguments
 * This generates an MCPC config that wraps one or more existing MCP servers
 */
async function createWrapConfig(args: {
  mcpServers?: ServerSpec[];
  mode?: string;
  name?: string;
  saveConfig?: boolean;
}): Promise<MCPCConfig> {
  if (!args.mcpServers || args.mcpServers.length === 0) {
    console.error(
      "Error: --wrap/--add requires at least one MCP server\n" +
        "Example: mcpc --wrap --mcp-stdio 'npx -y @wonderwhy-er/desktop-commander'\n" +
        "Multiple: mcpc --add --mcp-stdio 'npx -y server1' --mcp-http 'https://api.example.com'",
    );
    process.exit(1);
  }

  // Build MCP servers configuration
  const mcpServers: Record<string, any> = {};
  const serverNames: string[] = [];
  const refs: string[] = [];

  for (const spec of args.mcpServers) {
    const serverName = extractServerName(spec.command, spec.args);

    mcpServers[serverName] = {
      command: spec.command,
      args: spec.args,
      transportType: spec.transportType,
    };

    serverNames.push(serverName);
    refs.push(`<tool name="${serverName}.__ALL__"/>`);

    console.error(
      `Added MCP server: ${serverName}\n` +
        `  Transport: ${spec.transportType}\n` +
        `  Command: ${spec.command} ${spec.args.join(" ")}`,
    );
  }

  // Use custom name if provided, otherwise use merged server names
  const agentName = args.name || `${serverNames.join("__")}--orchestrator`;

  // Create configuration
  const config: MCPCConfig = {
    name: "mcpc-wrap-config",
    version: "0.1.0",
    capabilities: {
      tools: {},
    },
    agents: [
      {
        name: agentName,
        description: `Orchestrate ${
          serverNames.length === 1 ? serverNames[0] : serverNames.join(", ")
        } MCP server tools`,
        deps: {
          mcpServers: mcpServers,
        },
        options: {
          mode: args.mode || "agentic",
          refs: refs as any,
        },
      },
    ],
  };

  const modeInfo = args.mode ? `\nMode: ${args.mode}` : "";
  console.error(
    `\nCreated configuration for ${serverNames.length} MCP server(s)${modeInfo}`,
  );

  // Save configuration to user's config file if requested
  if (args.saveConfig) {
    await saveUserConfig(config, agentName);
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
    --add                   Add MCP servers to ~/.mcpc/config.json and exit
                           Then run 'mcpc' to start the server with saved config
                           Use --mcp-stdio, --mcp-http, or --mcp-sse to specify servers
    --wrap                  Wrap and run MCP servers immediately without saving config
                           Use --mcp-stdio, --mcp-http, or --mcp-sse to specify servers
    --mcp-stdio <cmd>       Add an MCP server with stdio transport
                           Example: --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
    --mcp-http <url>        Add an MCP server with streamable-http transport
                           Example: --mcp-http "https://api.github.com/mcp"
    --mcp-sse <url>         Add an MCP server with SSE transport
                           Example: --mcp-sse "https://api.example.com/sse"
    --name <name>           Custom agent name for wrap mode (overrides auto-detection)

ENVIRONMENT VARIABLES:
    MCPC_CONFIG            Inline JSON configuration (same as --config)
    MCPC_CONFIG_URL        URL to fetch config from (same as --config-url)
    MCPC_CONFIG_FILE       Path to config file (same as --config-file)

EXAMPLES:
    # Show help
    mcpc --help

    # Add MCP servers to config and save to ~/.mcpc/config.json
    mcpc --add --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
    # Edit ~/.mcpc/config.json if needed (add headers, etc.)
    mcpc  # Loads config from ~/.mcpc/config.json automatically

    # Wrap and run immediately (one-time use, no config saved)
    mcpc --wrap --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"

    # Multiple servers with different transports
    mcpc --add \
      --mcp-stdio "npx -y @wonderwhy-er/desktop-commander" \
      --mcp-http "https://api.github.com/mcp" \
      --mcp-sse "https://api.example.com/sse"

    # Custom agent name
    mcpc --add --name my-agent --mcp-stdio "npx shadcn@latest mcp"
    mcpc --wrap --name my-agent --mcp-stdio "npx shadcn@latest mcp"

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
  add?: boolean;
  wrap?: boolean;
  mcpServers?: ServerSpec[];
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
    add?: boolean;
    wrap?: boolean;
    mcpServers?: ServerSpec[];
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
    } else if (arg === "--add") {
      result.add = true;
    } else if (arg === "--wrap") {
      result.wrap = true;
    } else if (
      (arg === "--mcp-stdio" || arg === "--mcp-http" || arg === "--mcp-sse") &&
      i + 1 < args.length
    ) {
      // Parse MCP server specification
      const cmdString = args[++i];
      const cmdParts = cmdString.split(/\s+/);
      const command = cmdParts[0];
      const cmdArgs = cmdParts.slice(1);

      let transportType: "stdio" | "streamable-http" | "sse";
      if (arg === "--mcp-stdio") {
        transportType = "stdio";
      } else if (arg === "--mcp-http") {
        transportType = "streamable-http";
      } else {
        transportType = "sse";
      }

      if (!result.mcpServers) {
        result.mcpServers = [];
      }
      result.mcpServers.push({
        command,
        args: cmdArgs,
        transportType,
      });
    } else if (arg === "--mode" && i + 1 < args.length) {
      result.mode = args[++i];
    } else if (arg === "--name" && i + 1 < args.length) {
      result.name = args[++i];
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

  // Handle --add mode - generate config, save, and exit
  if (args.add) {
    await createWrapConfig({ ...args, saveConfig: true });
    process.exit(0);
  }

  // Handle --wrap mode - generate config and run immediately (no save)
  if (args.wrap) {
    return await createWrapConfig({ ...args, saveConfig: false });
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

  // Priority 5: ~/.mcpc/config.json (user config directory)
  const userConfigPath = getUserConfigPath();
  try {
    const content = await readFile(userConfigPath, "utf-8");
    const parsed = JSON.parse(content);
    return applyModeOverride(normalizeConfig(parsed), args.mode);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Failed to load config from ${userConfigPath}:`, error);
      throw error;
    }
    // File doesn't exist, continue to next option
  }

  // Priority 6: ./mcpc.config.json in current directory
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
