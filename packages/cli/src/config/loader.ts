/** Configuration Loader for MCPC CLI
 *
 * This module provides utilities to load MCPC configuration from command-line arguments or files.
 *
 * Command-line arguments:
 * - `--config <json>` - Inline JSON configuration string
 * - `--config-url <url>` - Fetch configuration from URL (e.g., GitHub raw)
 * - `--config-file <path>` - Path to configuration file
 * - No arguments - Uses ./mcpc.config.json if available
 *
 * @example
 * ```bash
 * # Inline JSON config
 * deno run --allow-all src/bin.ts --config '[{"name":"my-agent","description":"..."}]'
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
    --request-headers <header>, -H <header>
                           Add custom HTTP header for URL fetching
                           Format: "Key: Value" or "Key=Value"
                           Can be used multiple times

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

    # Use default configuration (./mcpc.config.json)
    npx -y deno run -A jsr:@mcpc/cli/bin

CONFIGURATION:
    Configuration files support environment variable substitution using $VAR_NAME syntax.
    
    Priority order:
    1. --config (inline JSON)
    2. --config-url (fetch from URL)
    3. --config-file (file path)
    4. ./mcpc.config.json (default)

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
} {
  const args = process.argv.slice(2);
  const result: {
    config?: string;
    configUrl?: string;
    configFile?: string;
    requestHeaders?: Record<string, string>;
    help?: boolean;
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
      (arg === "--request-headers" || arg === "-H") && i + 1 < args.length
    ) {
      // Parse header in format "Key: Value" or "Key=Value"
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
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  return result;
}

/**
 * Load configuration from command-line arguments or default file
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

  // Priority 2: --config-url (fetch from URL)
  if (args.configUrl) {
    try {
      const headers: HeadersInit = {
        "User-Agent": "MCPC-CLI/0.1.0",
        ...args.requestHeaders,
      };
      const response = await fetch(args.configUrl, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const content = await response.text();
      const parsed = JSON.parse(content);
      return normalizeConfig(parsed);
    } catch (error) {
      console.error(`Failed to fetch config from ${args.configUrl}:`, error);
      throw error;
    }
  }

  // Priority 3: --config-file (file path)
  if (args.configFile) {
    try {
      const content = await readFile(args.configFile, "utf-8");
      const parsed = JSON.parse(content);
      return normalizeConfig(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.error(`Config file not found: ${args.configFile}`);
        throw error;
      } else {
        console.error(`Failed to load config from ${args.configFile}:`, error);
        throw error;
      }
    }
  }

  // Priority 4: ./mcpc.config.json in current directory
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
