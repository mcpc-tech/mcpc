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

import type { ComposeInput } from "@mcpc/core";
import { parseArgs } from "@std/cli/parse-args";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { DEFAULT_SKILLS_PATHS } from "../defaults.ts";

/** CLI version - synced with deno.json */
const CLI_VERSION = "0.1.44";

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
   * Agent composition definitions (can include markdown file paths)
   */
  agents: ComposeInput[];
  /**
   * Skills directories to scan for domain-specific knowledge
   * @see https://agentskills.io/specification
   */
  skills?: string[];
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
        (agent) => typeof agent !== "string" && agent.name === newAgentName,
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
 * Print version information
 */
function printVersion(): void {
  console.log(`mcpc ${CLI_VERSION}`);
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
mcpc ${CLI_VERSION} - Model Context Protocol Composer

USAGE:
    mcpc [OPTIONS]

OPTIONS:
    -h, --help              Show this help message
    -v, --version           Show version information
    --cwd <path>            Change working directory before loading config
    --config <json>         Inline JSON configuration string
    --config-url <url>      Fetch configuration from URL
    --config-file <path>    Load configuration from file path
    --skills <dirs>         Skills directories (comma-separated)
    -H, --request-headers <header>
                            Add custom HTTP header for URL fetching
                            Format: "Key: Value" or "Key=Value"
    --mode <mode>           Set execution mode for agents
                            Modes: agentic, ai_sampling, ai_acp, code_execution
    --add                   Add MCP servers to ~/.mcpc/config.json and exit
    --wrap                  Wrap and run MCP servers immediately
    --mcp-stdio <cmd>       Add an MCP server with stdio transport
    --mcp-http <url>        Add an MCP server with streamable-http transport
    --mcp-sse <url>         Add an MCP server with SSE transport
    --name <name>           Custom agent name for wrap mode

ENVIRONMENT VARIABLES:
    MCPC_CONFIG             Inline JSON configuration
    MCPC_CONFIG_URL         URL to fetch config from
    MCPC_CONFIG_FILE        Path to config file

EXAMPLES:
    mcpc --help
    mcpc --version
    mcpc --add --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
    mcpc --wrap --mcp-stdio "npx -y @wonderwhy-er/desktop-commander"
    mcpc --config-url "https://example.com/config.json"
    mcpc --config-file ./my-config.json

CONFIG PRIORITY:
    1. --config (inline JSON)
    2. MCPC_CONFIG environment variable
    3. --config-url or MCPC_CONFIG_URL
    4. --config-file or MCPC_CONFIG_FILE
    5. ~/.mcpc/config.json (user config)
    6. ./mcpc.config.json (local config)

For more information: https://github.com/mcpc-tech/mcpc
`);
}

/** Parsed CLI arguments type */
interface ParsedArgs {
  config?: string;
  configUrl?: string;
  configFile?: string;
  requestHeaders?: Record<string, string>;
  help?: boolean;
  version?: boolean;
  add?: boolean;
  wrap?: boolean;
  mcpServers?: ServerSpec[];
  mode?: string;
  name?: string;
  skills?: string[];
  cwd?: string;
}

/**
 * Parse a header string in format "Key: Value" or "Key=Value"
 */
function parseHeader(headerStr: string): { key: string; value: string } | null {
  const colonIdx = headerStr.indexOf(":");
  const equalIdx = headerStr.indexOf("=");
  const separatorIdx = colonIdx !== -1
    ? equalIdx !== -1 ? Math.min(colonIdx, equalIdx) : colonIdx
    : equalIdx;

  if (separatorIdx !== -1) {
    return {
      key: headerStr.substring(0, separatorIdx).trim(),
      value: headerStr.substring(separatorIdx + 1).trim(),
    };
  }
  return null;
}

/**
 * Parse MCP server specification from command string
 */
function parseMcpServer(
  cmdString: string,
  transportType: "stdio" | "streamable-http" | "sse",
): ServerSpec {
  const cmdParts = cmdString.split(/\s+/);
  return {
    command: cmdParts[0],
    args: cmdParts.slice(1),
    transportType,
  };
}

/**
 * Parse command-line arguments using @std/cli
 */
function parseCLIArgs(): ParsedArgs {
  const args = parseArgs(process.argv.slice(2), {
    boolean: ["help", "version", "add", "wrap"],
    string: [
      "cwd",
      "config",
      "config-url",
      "config-file",
      "mode",
      "name",
      "skills",
      "mcp-stdio",
      "mcp-http",
      "mcp-sse",
    ],
    collect: ["request-headers", "mcp-stdio", "mcp-http", "mcp-sse"],
    alias: {
      h: "help",
      v: "version",
      H: "request-headers",
    },
    default: {
      help: false,
      version: false,
      add: false,
      wrap: false,
    },
  });

  const result: ParsedArgs = {
    help: args.help,
    version: args.version,
    add: args.add,
    wrap: args.wrap,
    cwd: args.cwd,
    config: args.config,
    configUrl: args["config-url"],
    configFile: args["config-file"],
    mode: args.mode,
    name: args.name,
  };

  // Parse skills
  if (args.skills) {
    result.skills = args.skills.split(",").map((s: string) => s.trim()).filter(
      Boolean,
    );
  }

  // Parse request headers
  const headers = args["request-headers"] as string[] | undefined;
  if (headers && headers.length > 0) {
    result.requestHeaders = {};
    for (const h of headers) {
      const parsed = parseHeader(h);
      if (parsed) {
        result.requestHeaders[parsed.key] = parsed.value;
      }
    }
  }

  // Parse MCP servers
  const mcpStdio = args["mcp-stdio"] as string[] | undefined;
  const mcpHttp = args["mcp-http"] as string[] | undefined;
  const mcpSse = args["mcp-sse"] as string[] | undefined;

  if (
    (mcpStdio && mcpStdio.length > 0) ||
    (mcpHttp && mcpHttp.length > 0) ||
    (mcpSse && mcpSse.length > 0)
  ) {
    result.mcpServers = [];
    if (mcpStdio) {
      for (const cmd of mcpStdio) {
        result.mcpServers.push(parseMcpServer(cmd, "stdio"));
      }
    }
    if (mcpHttp) {
      for (const url of mcpHttp) {
        result.mcpServers.push(parseMcpServer(url, "streamable-http"));
      }
    }
    if (mcpSse) {
      for (const url of mcpSse) {
        result.mcpServers.push(parseMcpServer(url, "sse"));
      }
    }
  }

  return result;
}

/**
 * Load configuration from command-line arguments, environment variables, or default file
 * @returns Configuration object or null if no configuration found
 */
export async function loadConfig(): Promise<MCPCConfig | null> {
  const args = parseCLIArgs();

  // Handle --version
  if (args.version) {
    printVersion();
    process.exit(0);
  }

  // Handle --help
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Change working directory if --cwd is specified
  if (args.cwd) {
    const targetCwd = resolve(process.cwd(), args.cwd);
    process.chdir(targetCwd);
    console.error(`Changed working directory to: ${targetCwd}`);
  }

  // Helper to merge skills from args
  const mergeSkills = (config: MCPCConfig): MCPCConfig => {
    // CLI --skills overrides config.skills; if neither, use default
    config.skills = args.skills || config.skills || DEFAULT_SKILLS_PATHS;
    return config;
  };

  // Handle --add mode - generate config, save, and exit
  if (args.add) {
    await createWrapConfig({ ...args, saveConfig: true });
    process.exit(0);
  }

  // Handle --wrap mode - generate config and run immediately (no save)
  if (args.wrap) {
    return mergeSkills(await createWrapConfig({ ...args, saveConfig: false }));
  }

  // Priority 1: --config (inline JSON string)
  if (args.config) {
    try {
      const parsed = JSON.parse(args.config);
      return mergeSkills(applyModeOverride(normalizeConfig(parsed), args.mode));
    } catch (error) {
      console.error("Failed to parse --config argument:", error);
      throw error;
    }
  }

  // Priority 2: MCPC_CONFIG environment variable (for testing and scripting)
  if (process.env.MCPC_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.MCPC_CONFIG);
      return mergeSkills(applyModeOverride(normalizeConfig(parsed), args.mode));
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
      return mergeSkills(applyModeOverride(normalizeConfig(parsed), args.mode));
    } catch (error) {
      console.error(`Failed to fetch config from ${configUrl}:`, error);
      throw error;
    }
  }

  // Priority 4: --config-file or MCPC_CONFIG_FILE (file path)
  const configFile = args.configFile || process.env.MCPC_CONFIG_FILE;
  if (configFile) {
    try {
      const config = await loadConfigFromFile(configFile);
      return mergeSkills(applyModeOverride(config, args.mode));
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
    const config = await loadConfigFromFile(userConfigPath);
    return mergeSkills(applyModeOverride(config, args.mode));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Failed to load config from ${userConfigPath}:`, error);
      throw error;
    }
    // File doesn't exist, continue to next option
  }

  // Priority 6: ./mcpc.config.json in current directory
  const defaultJsonConfigPath = resolve(process.cwd(), "mcpc.config.json");

  try {
    const config = await loadConfigFromFile(defaultJsonConfigPath);
    return mergeSkills(applyModeOverride(config, args.mode));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // No config file found, this is okay
      return null;
    } else {
      console.error(
        `Failed to load config from ${defaultJsonConfigPath}:`,
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
 * Check if a path is a Markdown file
 */
function isMarkdownFile(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".markdown");
}

/**
 * Load configuration from a file
 * - JSON files: parsed and normalized
 * - Markdown files: returned as file path in agents array (resolved by markdownLoaderPlugin)
 * @param filePath Path to the configuration file
 * @returns Normalized MCPCConfig
 */
async function loadConfigFromFile(filePath: string): Promise<MCPCConfig> {
  if (isMarkdownFile(filePath)) {
    // Return markdown file path - resolved by markdownLoaderPlugin in mcpc()
    return {
      name: "mcpc-server",
      version: "0.1.0",
      agents: [filePath],
    };
  }
  // JSON: parse and normalize
  const content = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(content);
  return normalizeConfig(parsed);
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

  // Apply mode to all agents (skip string paths)
  config.agents.forEach((agent) => {
    if (typeof agent === "string") return;
    if (!agent.options) agent.options = {};
    agent.options.mode = mode as any;

    // Add default acpSettings for ai_acp mode if not provided
    if (mode === "ai_acp" && !agent.options.acpSettings) {
      agent.options.acpSettings = {
        command: "claude-code-acp",
        args: [],
        session: {},
      };
    }
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
      agents: normalizeAgents(config as ComposeInput[]),
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
      skills: cfg.skills,
    };
  }

  throw new Error("Invalid configuration format");
}

/**
 * Normalize agents to ensure deps structure is correct
 */
function normalizeAgents(agents: ComposeInput[]): ComposeInput[] {
  return agents.map((agent) => {
    // Skip string paths (markdown files)
    if (typeof agent === "string") return agent;
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
    // Skip string paths (markdown files)
    if (typeof agent === "string") continue;
    if (agent.name === undefined) {
      throw new Error("Each agent must have a 'name' property");
    }
  }
}
