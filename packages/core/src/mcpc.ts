/**
 * MCPC - Single Configuration Object Pattern
 *
 * A cleaner, more intuitive API inspired by AI SDK's streamText design.
 * All configuration is provided through a single options object.
 */

import { ComposableMCPServer } from "./compose.ts";
import type { MCPSetting } from "./service/tools.ts";
import type { SamplingConfig, ToolRefXml } from "./types.ts";
import type { ToolPlugin } from "./plugin-types.ts";
import type { ExecutionMode } from "./prompts/types.ts";
import {
  isMarkdownFile,
  type MarkdownAgentLoader,
  setMarkdownAgentLoader as _setMarkdownAgentLoader,
} from "./set-up-mcp-compose.ts";

// Re-export for external use
export { setMarkdownAgentLoader } from "./set-up-mcp-compose.ts";

/**
 * MCP Server configuration for agent dependencies.
 * Supports stdio, sse, and streamable-http transport types.
 */
export interface McpServerDef {
  /** Command to start the MCP server (for stdio transport) */
  command?: string;
  /** Arguments for the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Transport type - defaults to "stdio" if command is provided */
  transportType?: "stdio" | "sse" | "streamable-http";
  /** URL for sse or streamable-http transport */
  url?: string;
  /** Headers for HTTP-based transports */
  headers?: Record<string, string>;
}

/**
 * Advanced options for agent execution.
 * Most users don't need these - they're for specialized modes like AI SDK sampling.
 */
export interface AgentOptions {
  /** Maximum execution steps */
  maxSteps?: number;

  /** Maximum tokens for sampling requests */
  maxTokens?: number;

  /** Enable OpenTelemetry tracing */
  tracingEnabled?: boolean;

  /** Sampling configuration */
  samplingConfig?: SamplingConfig;

  /** Provider options for AI SDK sampling mode */
  providerOptions?: {
    modelPreferences?: {
      hints?: Array<{ name?: string }>;
      costPriority?: number;
      speedPriority?: number;
      intelligencePriority?: number;
    };
  };

  /** ACP settings for AI SDK ACP mode */
  acpSettings?: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    session?: {
      cwd?: string;
      mcpServers?: Array<{
        name: string;
        command: string;
        args?: string[];
        env?: Record<string, string>;
      }>;
    };
    persistSession?: boolean;
  };

  /** Tool reference overrides */
  refs?: Array<ToolRefXml>;
}

/**
 * Agent definition - defines an agentic tool with its dependencies.
 */
export interface AgentDef {
  /** Agent name - set to null for composition-only mode (no tool created) */
  name: string | null;

  /** Agent description with <tool> tags for tool references */
  description?: string;

  /**
   * MCP server dependencies - flat structure
   * @example
   * ```typescript
   * mcpServers: {
   *   "desktop-commander": {
   *     command: "npx",
   *     args: ["-y", "@wonderwhy-er/desktop-commander"],
   *   },
   * }
   * ```
   */
  mcpServers?: Record<string, McpServerDef>;

  /**
   * Execution mode for this agent
   * @default "agentic"
   */
  mode?: ExecutionMode;

  /**
   * Agent-specific plugins (in addition to global plugins).
   */
  plugins?: (ToolPlugin | string)[];

  /**
   * Advanced options for specialized execution modes.
   * Most users don't need this.
   */
  options?: AgentOptions;
}

/**
 * Server capabilities configuration
 */
export interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
  resources?: Record<string, unknown>;
}

/**
 * Main configuration for mcpc API.
 * All options in a single, flat configuration object.
 */
export interface McpcConfig {
  // ============ Server Configuration ============

  /** Server name (required) */
  name: string;

  /**
   * Server version
   * @default "1.0.0"
   */
  version?: string;

  /**
   * Server capabilities
   * @default { tools: { listChanged: true } }
   */
  capabilities?: ServerCapabilities;

  // ============ Agent Configuration ============

  /**
   * Single agent definition (shorthand for `agents: [...]`).
   * Use this when you only have one agent.
   *
   * @example
   * ```typescript
   * agent: { name: "file-manager", description: "...", mcpServers: {...} }
   * ```
   */
  agent?: AgentDef | string;

  /**
   * Multiple agent definitions - can be inline objects or file paths.
   * File paths require the markdown-loader plugin.
   *
   * @example
   * ```typescript
   * agents: [
   *   { name: "file-reader", description: "...", mcpServers: {...} },
   *   "./agents/coding-agent.md"
   * ]
   * ```
   */
  agents?: (AgentDef | string)[];

  // ============ Plugin Configuration ============

  /**
   * Global plugins applied to ALL agents.
   * Use this for plugins that should affect every agent (e.g., logging, caching).
   *
   * For loader plugins (e.g., markdown-loader), use `setup` callback instead.
   *
   * @example
   * ```typescript
   * plugins: [
   *   createLargeResultPlugin({ maxSize: 8000 }),
   *   createLoggingPlugin(),
   * ]
   * ```
   */
  plugins?: (ToolPlugin | string)[];

  // ============ Setup Hook ============

  /**
   * Setup callback for custom configuration.
   * Called after plugins are loaded but before agents are composed.
   *
   * @example
   * ```typescript
   * setup: async (server) => {
   *   server.tool("custom-tool", "desc", schema, handler);
   * }
   * ```
   */
  setup?: (server: ComposableMCPServer) => void | Promise<void>;
}

/**
 * Convert AgentDef to legacy ComposeDefinition format
 * @param agent - The agent definition
 * @param globalPlugins - Global plugins to merge with agent plugins
 */
function agentDefToComposeDefinition(
  agent: AgentDef,
  globalPlugins: (ToolPlugin | string)[] = [],
): import("./set-up-mcp-compose.ts").ComposeDefinition {
  // Convert flat mcpServers to nested deps.mcpServers structure
  const deps: MCPSetting | undefined = agent.mcpServers
    ? {
      mcpServers: Object.fromEntries(
        Object.entries(agent.mcpServers).map(([name, def]) => [
          name,
          {
            command: def.command,
            args: def.args,
            env: def.env,
            transportType: def.transportType ??
              (def.command ? "stdio" : undefined),
            url: def.url,
            headers: def.headers,
          },
        ]),
      ) as MCPSetting["mcpServers"],
    }
    : undefined;

  // Merge global plugins with agent-specific plugins
  // Global plugins come first, then agent-specific plugins
  const mergedPlugins = [...globalPlugins, ...(agent.plugins ?? [])];

  return {
    name: agent.name,
    description: agent.description,
    deps,
    plugins: mergedPlugins.length > 0 ? mergedPlugins : undefined,
    options: {
      mode: agent.mode,
      // Spread advanced options from agent.options
      ...agent.options,
    },
  };
}

/**
 * Global markdown loader reference
 */
let markdownAgentLoader: MarkdownAgentLoader | null = null;

/**
 * Register the Markdown agent loader
 */
export function registerMarkdownLoader(loader: MarkdownAgentLoader): void {
  markdownAgentLoader = loader;
  _setMarkdownAgentLoader(loader);
}

/**
 * Resolve agent input to AgentDef
 */
async function resolveAgentInput(input: AgentDef | string): Promise<AgentDef> {
  if (typeof input !== "string") {
    return input;
  }

  if (!isMarkdownFile(input)) {
    throw new Error(
      `Invalid agent input: "${input}". ` +
        `Expected a Markdown file path (.md) or an AgentDef object.`,
    );
  }

  if (!markdownAgentLoader) {
    throw new Error(
      `Cannot load Markdown agent file "${input}": Markdown loader not available. ` +
        `Add "@mcpc/plugin-markdown-loader" to plugins, or use inline AgentDef objects.`,
    );
  }

  const composeDef = await markdownAgentLoader(input);

  // Convert ComposeDefinition back to AgentDef
  return {
    name: composeDef.name,
    description: composeDef.description,
    mcpServers: composeDef.deps?.mcpServers
      ? Object.fromEntries(
        Object.entries(composeDef.deps.mcpServers).map(([name, def]) => [
          name,
          {
            command: (def as any).command,
            args: (def as any).args,
            env: (def as any).env,
            transportType: (def as any).transportType,
            url: (def as any).url,
            headers: (def as any).headers,
          },
        ]),
      )
      : undefined,
    mode: composeDef.options?.mode,
    plugins: composeDef.plugins,
    // Pack advanced options into options field
    options: {
      maxSteps: composeDef.options?.maxSteps,
      maxTokens: composeDef.options?.maxTokens,
      tracingEnabled: composeDef.options?.tracingEnabled,
      samplingConfig: composeDef.options?.samplingConfig,
      providerOptions: composeDef.options?.providerOptions,
      acpSettings: composeDef.options?.acpSettings,
      refs: composeDef.options?.refs,
    },
  };
}

/**
 * Create and configure an agentic MCP server with composed tools.
 *
 * Uses a single configuration object for cleaner usage.
 *
 * @example
 * ```typescript
 * import { mcpc } from "@mcpc/core";
 * import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
 *
 * const server = await mcpc({
 *   name: "my-server",
 *   version: "1.0.0",
 *   capabilities: { tools: { listChanged: true } },
 *
 *   agents: [{
 *     name: "file-manager",
 *     description: `A file management agent.
 *       <tool name="desktop-commander.read_file"/>
 *       <tool name="desktop-commander.write_file"/>`,
 *     mcpServers: {
 *       "desktop-commander": {
 *         command: "npx",
 *         args: ["-y", "@wonderwhy-er/desktop-commander"],
 *       },
 *     },
 *   }],
 *
 *   plugins: ["@mcpc/plugin-markdown-loader"],
 * });
 *
 * await server.connect(new StdioServerTransport());
 * ```
 *
 * @param config - Server and agent configuration
 * @returns A configured MCP Server instance ready to connect
 */
export async function mcpc(
  config: McpcConfig,
): Promise<ComposableMCPServer> {
  const {
    name,
    version = "1.0.0",
    capabilities = { tools: { listChanged: true } },
    agent,
    agents = [],
    plugins = [],
    setup,
  } = config;

  // Merge agent (singular) into agents array
  const allAgents = agent ? [agent, ...agents] : agents;

  // Create server with flattened configuration
  const server = new ComposableMCPServer(
    { name, version },
    { capabilities: { logging: {}, ...capabilities } },
  );

  // Initialize built-in plugins
  await server.initBuiltInPlugins();

  // Run setup callback if provided (can be used for loader plugins like markdown-loader)
  if (setup) {
    await setup(server);
  }

  // Resolve all agent inputs (file paths and inline definitions)
  const resolvedAgents = await Promise.all(allAgents.map(resolveAgentInput));

  // Compose each agent with global plugins merged
  for (const agent of resolvedAgents) {
    const composeDef = agentDefToComposeDefinition(agent, plugins);

    // Load plugins for this agent (global + agent-specific)
    if (composeDef.plugins) {
      for (const plugin of composeDef.plugins) {
        if (typeof plugin === "string") {
          await server.loadPluginFromPath(plugin);
        } else {
          await server.addPlugin(plugin);
        }
      }
    }

    await server.compose(
      composeDef.name,
      composeDef.description ?? "",
      composeDef.deps,
      composeDef.options,
    );
  }

  return server;
}

// ============ Type Exports ============

export type { ToolPlugin } from "./plugin-types.ts";
export type { ExecutionMode } from "./prompts/types.ts";
export type { SamplingConfig, ToolRefXml } from "./types.ts";
