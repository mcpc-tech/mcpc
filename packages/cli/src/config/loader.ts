/** Configuration Loader for MCPC CLI
 *
 * This module provides utilities to load MCPC configuration from multiple sources:
 * 1. Environment variable (MCPC_CONFIG) - JSON string
 * 2. Config URL (MCPC_CONFIG_URL) - Fetch from URL (e.g., GitHub raw)
 * 3. Config file path (MCPC_CONFIG_FILE) - Path to custom config file
 * 4. Config file (mcpc.config.json) - JSON file in current directory
 *
 * Priority: MCPC_CONFIG env var > MCPC_CONFIG_URL > MCPC_CONFIG_FILE > ./mcpc.config.json
 *
 * @example
 * ```typescript
 * // From environment variable
 * MCPC_CONFIG='[{"name":"my-agent","description":"...","deps":{...}}]' node server.js
 *
 * // From URL
 * MCPC_CONFIG_URL=https://raw.githubusercontent.com/user/repo/main/config.json node server.js
 *
 * // From config file
 * node server.js  // reads ./mcpc.config.json
 *
 * // From custom path
 * MCPC_CONFIG_FILE=/path/to/config.json node server.js
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
 * Load configuration from environment variable or config file
 * @returns Configuration object or null if no configuration found
 */
export async function loadConfig(): Promise<MCPCConfig | null> {
  // Priority 1: MCPC_CONFIG environment variable (JSON string)
  const envConfig = process.env.MCPC_CONFIG;
  if (envConfig) {
    try {
      const parsed = JSON.parse(envConfig);
      return normalizeConfig(parsed);
    } catch (error) {
      console.error("Failed to parse MCPC_CONFIG environment variable:", error);
      throw error;
    }
  }

  // Priority 2: MCPC_CONFIG_URL environment variable (fetch from URL)
  const configUrl = process.env.MCPC_CONFIG_URL;
  if (configUrl) {
    try {
      const response = await fetch(configUrl);
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

  // Priority 3: MCPC_CONFIG_FILE environment variable (file path)
  const configFilePath = process.env.MCPC_CONFIG_FILE;
  if (configFilePath) {
    try {
      const content = await readFile(configFilePath, "utf-8");
      const parsed = JSON.parse(content);
      return normalizeConfig(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.warn(
          `Config file not found at path: ${configFilePath}`,
        );
      } else {
        console.error(`Failed to load config from ${configFilePath}:`, error);
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
