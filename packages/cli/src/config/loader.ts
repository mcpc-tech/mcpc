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

import type { ComposeDefinition, ToolPlugin } from "@mcpc/core";
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

type ComposeRefs = NonNullable<ComposeDefinition["options"]> extends
  { refs?: infer R } ? R extends Array<infer U> ? U[]
  : string[]
  : string[];

interface InlineAgentArgs {
  name?: string;
  description?: string;
  depsJson?: string;
  pluginStrings?: string[];
  optionsJson?: string;
  refs?: ComposeRefs;
  mcpEntries?: string[];
}

interface ParsedArgs {
  config?: string;
  configUrl?: string;
  configFile?: string;
  requestHeaders?: Record<string, string>;
  help?: boolean;
  inlineAgent?: InlineAgentArgs;
  serverName?: string;
  serverVersion?: string;
  serverCapabilitiesJson?: string;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
MCPC CLI - Model Context Protocol Composer

USAGE:
    npx -y deno run -A jsr:@mcpc/cli/bin [OPTIONS]

OPTIONS:
    --help, -h              Show this help message
    --config <json>         Inline JSON configuration string
    --config-url <url>      Fetch configuration from URL
    --config-file <path>    Load configuration from file path
  --agent-name <name>     Create inline agent without a config file
  --agent-description <text>
               Description for the inline agent
  --agent-deps <json>     JSON for agent deps (ComposeDefinition.deps)
  --mcp <name=json>       Add MCP dependency (repeatable)
  --agent-plugin <value>  Add plugin (repeatable, JSON or module path)
  --agent-options <json>  JSON for agent options
  --agent-ref <xml>       Add <tool/> reference (repeatable)
  --server-name <name>    Override server metadata name
  --server-version <ver>  Override server metadata version
  --server-capabilities <json>
               JSON object for server capabilities
    --request-headers <header>, -H <header>
                           Add custom HTTP header for URL fetching
                           Format: "Key: Value" or "Key=Value"
                           Can be used multiple times

ENVIRONMENT VARIABLES:
    MCPC_CONFIG            Inline JSON configuration (same as --config)
    MCPC_CONFIG_URL        URL to fetch config from (same as --config-url)
    MCPC_CONFIG_FILE       Path to config file (same as --config-file)

EXAMPLES:
    # Show help
    npx -y deno run -A jsr:@mcpc/cli/bin --help

    # Load from URL
    npx -y deno run -A jsr:@mcpc/cli/bin --config-url \\
      "https://raw.githubusercontent.com/mcpc-tech/mcpc/main/packages/cli/examples/configs/codex-fork.json"

    # Load from URL with custom headers
    npx -y deno run -A jsr:@mcpc/cli/bin \\
      --config-url "https://api.example.com/config.json" \\
      -H "Authorization: Bearer token123" \\
      -H "X-Custom-Header: value"

    # Load from file
    npx -y deno run -A jsr:@mcpc/cli/bin --config-file ./my-config.json

    # Using environment variable
    export MCPC_CONFIG='[{"name":"agent","description":"..."}]'
    npx -y deno run -A jsr:@mcpc/cli/bin

    # Use default configuration (./mcpc.config.json)
    npx -y deno run -A jsr:@mcpc/cli/bin

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
function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {};

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === "--config" && i + 1 < args.length) {
      result.config = args[++i];
    } else if (current === "--config-url" && i + 1 < args.length) {
      result.configUrl = args[++i];
    } else if (current === "--config-file" && i + 1 < args.length) {
      result.configFile = args[++i];
    } else if (
      (current === "--request-headers" || current === "-H") && i + 1 <
        args.length
    ) {
      const headerStr = args[++i];
      const colonIdx = headerStr.indexOf(":");
      const equalIdx = headerStr.indexOf("=");
      const separatorIdx = colonIdx !== -1
        ? (equalIdx !== -1 ? Math.min(colonIdx, equalIdx) : colonIdx)
        : equalIdx;

      if (separatorIdx !== -1) {
        const key = headerStr.substring(0, separatorIdx).trim();
        const value = headerStr.substring(separatorIdx + 1).trim();
        if (!result.requestHeaders) {
          result.requestHeaders = {};
        }
        result.requestHeaders[key] = value;
      }
    } else if (current === "--agent-name" && i + 1 < args.length) {
      result.inlineAgent ??= {};
      result.inlineAgent.name = args[++i];
    } else if (current === "--agent-description" && i + 1 < args.length) {
      result.inlineAgent ??= {};
      result.inlineAgent.description = args[++i];
    } else if (current === "--agent-deps" && i + 1 < args.length) {
      result.inlineAgent ??= {};
      result.inlineAgent.depsJson = args[++i];
    } else if (current === "--agent-plugin" && i + 1 < args.length) {
      result.inlineAgent ??= {};
      result.inlineAgent.pluginStrings ??= [];
      result.inlineAgent.pluginStrings.push(args[++i]);
    } else if (current === "--agent-options" && i + 1 < args.length) {
      result.inlineAgent ??= {};
      result.inlineAgent.optionsJson = args[++i];
    } else if (current === "--agent-ref" && i + 1 < args.length) {
      result.inlineAgent ??= {};
      result.inlineAgent.refs ??= [];
      result.inlineAgent.refs.push(args[++i] as ComposeRefs[number]);
    } else if (current === "--mcp" && i + 1 < args.length) {
      result.inlineAgent ??= {};
      result.inlineAgent.mcpEntries ??= [];
      result.inlineAgent.mcpEntries.push(args[++i]);
    } else if (current === "--server-name" && i + 1 < args.length) {
      result.serverName = args[++i];
    } else if (current === "--server-version" && i + 1 < args.length) {
      result.serverVersion = args[++i];
    } else if (current === "--server-capabilities" && i + 1 < args.length) {
      result.serverCapabilitiesJson = args[++i];
    } else if (current === "--help" || current === "-h") {
      result.help = true;
    }
  }

  return result;
}

function hasInlineAgentArgs(value?: InlineAgentArgs): value is InlineAgentArgs {
  if (!value) {
    return false;
  }

  return Boolean(
    value.name !== undefined ||
      value.description !== undefined ||
      value.depsJson ||
      value.optionsJson ||
      (value.pluginStrings && value.pluginStrings.length > 0) ||
      (value.refs && value.refs.length > 0) ||
      (value.mcpEntries && value.mcpEntries.length > 0),
  );
}

function parseJsonWithContext<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${context} JSON: ${message}`);
  }
}

function parsePluginString(value: string): ToolPlugin | string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Plugin value cannot be empty");
  }

  try {
    return JSON.parse(trimmed) as ToolPlugin;
  } catch (_error) {
    return trimmed;
  }
}

function buildInlineAgentConfig(
  inline: InlineAgentArgs,
  serverName?: string,
  serverVersion?: string,
  serverCapabilitiesJson?: string,
): MCPCConfig {
  let deps = inline.depsJson
    ? parseJsonWithContext<ComposeDefinition["deps"]>(
      inline.depsJson,
      "--agent-deps",
    )
    : undefined;

  if (inline.mcpEntries && inline.mcpEntries.length > 0) {
    deps ??= { mcpServers: {} };
    deps.mcpServers ??= {};

    for (const entry of inline.mcpEntries) {
      const separator = entry.indexOf("=");
      if (separator === -1) {
        throw new Error(
          `Invalid --mcp value '${entry}'. Expected format name=json`,
        );
      }

      const name = entry.slice(0, separator).trim();
      const json = entry.slice(separator + 1);

      if (!name) {
        throw new Error(`Invalid --mcp value '${entry}'. Name cannot be empty`);
      }

      deps.mcpServers![name] = parseJsonWithContext<unknown>(
        json,
        `--mcp ${name}`,
      ) as Record<string, unknown>;
    }
  }

  const plugins = inline.pluginStrings
    ? inline.pluginStrings.map((value) => parsePluginString(value))
    : undefined;

  let options = inline.optionsJson
    ? parseJsonWithContext<ComposeDefinition["options"]>(
      inline.optionsJson,
      "--agent-options",
    )
    : undefined;

  if (inline.refs && inline.refs.length > 0) {
    options ??= {};
    const existingRefs = options.refs ? [...options.refs] : [] as ComposeRefs;
    options.refs = [...existingRefs, ...inline.refs] as ComposeRefs;
  }

  const agent: ComposeDefinition = {
    name: inline.name ?? "inline-agent",
    description: inline.description,
    deps,
    plugins,
    options,
  };

  const capabilities = serverCapabilitiesJson
    ? parseJsonWithContext<unknown>(
      serverCapabilitiesJson,
      "--server-capabilities",
    ) as MCPCConfig["capabilities"]
    : undefined;

  const config: MCPCConfig = {
    name: serverName || "mcpc-server",
    version: serverVersion || "0.1.0",
    capabilities,
    agents: [agent],
  };

  return normalizeConfig(config);
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

  // Priority 1: --config (inline JSON string)
  if (args.config) {
    try {
      const parsed = JSON.parse(args.config);
      return normalizeConfig(parsed);
    } catch (error) {
      console.error("Failed to parse --config argument:", error);
      throw error;
    }
  }

  // Priority 2: Inline agent CLI arguments
  if (hasInlineAgentArgs(args.inlineAgent)) {
    return buildInlineAgentConfig(
      args.inlineAgent,
      args.serverName,
      args.serverVersion,
      args.serverCapabilitiesJson,
    );
  }

  // Priority 3: MCPC_CONFIG environment variable (for testing and scripting)
  if (process.env.MCPC_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.MCPC_CONFIG);
      return normalizeConfig(parsed);
    } catch (error) {
      console.error("Failed to parse MCPC_CONFIG environment variable:", error);
      throw error;
    }
  }

  // Priority 4: --config-url or MCPC_CONFIG_URL (fetch from URL)
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
      return normalizeConfig(parsed);
    } catch (error) {
      console.error(`Failed to fetch config from ${configUrl}:`, error);
      throw error;
    }
  }

  // Priority 5: --config-file or MCPC_CONFIG_FILE (file path)
  const configFile = args.configFile || process.env.MCPC_CONFIG_FILE;
  if (configFile) {
    try {
      const content = await readFile(configFile, "utf-8");
      const parsed = JSON.parse(content);
      return normalizeConfig(parsed);
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

  // Priority 6: ./mcpc.config.json in current directory
  const defaultConfigPath = resolve(process.cwd(), "mcpc.config.json");
  try {
    const content = await readFile(defaultConfigPath, "utf-8");
    const parsed = JSON.parse(content);
    return normalizeConfig(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // No config file found, this is okay
      return null;
    } else {
      console.error(
        `Failed to load config from ${defaultConfigPath}:`,
        error,
      );
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
