import { ComposableMCPServer } from "../mod.ts";
import type { MCPSetting } from "./service/tools.ts";
import type { SamplingConfig } from "./types.ts";
import type { ToolPlugin } from "./plugin-types.ts";
import type { ToolRefXml } from "./types.ts";
import type { ExecutionMode } from "./prompts/types.ts";

export interface ComposeDefinition {
  /**
   * Name of the composed agentic tool
   * Set to null to skip creating the composed tool (composition-only mode).
   */
  name: string | null;
  /**
   * Description of the composed agent's purpose and capabilities.
   */
  description?: string;
  deps?: MCPSetting;

  /**
   * Global plugins to load and apply to all tools
   * Can be plugin objects or file paths to plugin files
   * @example
   * ```typescript
   * plugins: [
   *   './plugins/logger.js',
   *   './plugins/cache.js',
   *   { name: 'inline', apply: (tool) => tool }
   * ]
   * ```
   */
  plugins?: (ToolPlugin | string)[];

  options?: {
    /**
     * Execution mode for the agent
     * - "agentic": Fully autonomous agent mode (default)
     * - "ai_sampling": AI SDK sampling mode using streamText with MCP sampling provider
     * - "ai_acp": AI SDK ACP mode for coding agents (Claude Code, etc.)
     * @default "agentic"
     */
    mode?: ExecutionMode;

    /**
     * Configuration for sampling mode execution
     */
    samplingConfig?: SamplingConfig;

    /**
     * Provider options for AI SDK sampling mode
     * Only applies when mode is "ai_sampling"
     * @see https://github.com/mcpc-tech/mcpc/tree/main/packages/mcp-sampling-ai-provider
     */
    providerOptions?: {
      modelPreferences?: {
        hints?: Array<{ name?: string }>;
        costPriority?: number;
        speedPriority?: number;
        intelligencePriority?: number;
      };
    };

    /**
     * ACP settings for AI SDK ACP mode
     * Only applies when mode is "ai_acp"
     * @see https://github.com/mcpc-tech/mcpc/tree/main/packages/acp-ai-provider
     */
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

    /**
     * Maximum number of agentic steps
     * Applies to ai_sampling and ai_acp modes
     * @default 50
     */
    maxSteps?: number;

    /**
     * Maximum tokens for sampling requests
     * Applies to ai_sampling mode
     * @default 128_000
     */
    maxTokens?: number;

    /**
     * Enable OpenTelemetry tracing
     * Applies to ai_sampling and ai_acp modes
     * @default false
     */
    tracingEnabled?: boolean;

    /**
     * Default references for the dependent mcps
     *
     * @example
     * <tool name="example-tool" hide="true" global="false"/>
     */
    /**
     * References to dependent tools using a compact XML-like string.
     * Only the `name` attribute is required; other attributes are optional.
     */
    refs?: Array<ToolRefXml>;
  };
}

/**
 * Input type for mcpc() that supports both inline definitions and file paths.
 * - ComposeDefinition: Inline agent definition object
 * - string: Path to a Markdown agent file (.md)
 *
 * @example
 * ```typescript
 * // Mix of inline and file-based definitions
 * await mcpc(serverConf, [
 *   './agents/coding-agent.md',           // Load from file
 *   { name: 'inline-agent', description: '...' }  // Inline definition
 * ]);
 * ```
 */
export type ComposeInput = ComposeDefinition | string;

// ToolRefXml is defined in ./types.ts

export interface ComposibleMCPConfig {
  [key: string]: ComposeDefinition[];
}

/**
 * Markdown agent file loader function type.
 * This is injected by @mcpc/cli to avoid circular dependencies.
 */
export type MarkdownAgentLoader = (
  filePath: string,
) => Promise<ComposeDefinition>;

// Global loader reference - set by @mcpc/cli
let markdownAgentLoader: MarkdownAgentLoader | null = null;

/**
 * Register the Markdown agent loader (called by @mcpc/cli)
 */
export function setMarkdownAgentLoader(loader: MarkdownAgentLoader): void {
  markdownAgentLoader = loader;
}

/**
 * Check if a path is a Markdown file (.md or .markdown)
 */
export function isMarkdownFile(path: string): boolean {
  return path.endsWith(".md") || path.endsWith(".markdown");
}

/**
 * Resolve ComposeInput to ComposeDefinition
 * Supports both inline definitions and file paths
 */
async function resolveComposeInput(
  input: ComposeInput,
): Promise<ComposeDefinition> {
  if (typeof input !== "string") {
    return input;
  }

  if (!isMarkdownFile(input)) {
    throw new Error(
      `Invalid compose input: "${input}". ` +
        `Expected a Markdown file path (.md) or a ComposeDefinition object.`,
    );
  }

  if (!markdownAgentLoader) {
    throw new Error(
      `Cannot load Markdown agent file "${input}": Markdown loader not available. ` +
        `Import from "@mcpc/cli" to enable Markdown file support, or use inline ComposeDefinition objects.`,
    );
  }

  return await markdownAgentLoader(input);
}

export function parseMcpcConfigs(
  conf?: ComposeDefinition[],
): ComposeDefinition[] {
  return conf ?? [];
}

/**
 * Options for mcpc() function
 */
export interface McpcOptions {
  /**
   * Loader plugins to load BEFORE resolving compose inputs.
   * These plugins register file loaders (e.g., markdown-loader) that are needed
   * to parse file paths in composeConf.
   *
   * Note: This is different from ComposeDefinition.plugins which are runtime plugins
   * that transform tool descriptions and results AFTER composition.
   */
  plugins?: ToolPlugin[];

  /**
   * Callback to register custom tools or perform additional setup before composition.
   * Useful for adding internal tools or custom configurations.
   */
  setup?: (server: ComposableMCPServer) => void | Promise<void>;
}

/**
 * Create and configure an agentic MCP server with composed tools.
 *
 * This is the main entry point for building agentic MCP servers. It allows you to:
 * - Reuse existing MCP tools from the community by selecting and composing them
 * - Create powerful agentic tools by describing them in natural language with tool references
 * - Fine-tune tool descriptions and parameters to fit your specific use cases
 * - Build multi-agent systems where each agent is itself an MCP tool
 *
 * @example
 * ```typescript
 * // Using inline definitions
 * const server = await mcpc(
 *   [
 *     { name: "coding-agent", version: "1.0.0" },
 *     { capabilities: { tools: {} } }
 *   ],
 *   [{
 *     name: "codex-fork",
 *     description: `A coding agent that can read files, search code, and create PRs.
 *       Available tools:
 *       <tool name="desktop-commander.read_file"/>
 *       <tool name="github.create_pull_request"/>`,
 *     deps: {
 *       mcpServers: {
 *         "desktop-commander": {
 *           command: "npx",
 *           args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
 *           transportType: "stdio"
 *         },
 *         "github": {
 *           transportType: "streamable-http",
 *           url: "https://api.githubcopilot.com/mcp/",
 *           headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}` }
 *         }
 *       }
 *     },
 *     plugins: [createLargeResultPlugin({ maxSize: 8000 })],
 *     options: { mode: "ai_sampling" }
 *   }]
 * );
 *
 * // Using Markdown file paths with plugin
 * import { markdownLoaderPlugin } from "@mcpc/plugin-markdown-loader";
 *
 * const server = await mcpc(
 *   [{ name: "my-server", version: "1.0.0" }, { capabilities: { tools: {} } }],
 *   ["./agents/coding-agent.md"],
 *   { plugins: [markdownLoaderPlugin()] }
 * );
 *
 * await server.connect(new StdioServerTransport());
 * ```
 *
 * @param serverConf - MCP server initialization parameters including name, version, and capabilities
 *   - First element: Server metadata (name, version)
 *   - Second element: Server capabilities (tools, sampling, etc.)
 *
 * @param composeConf - Array of agent composition definitions or Markdown file paths.
 *   - ComposeDefinition: Inline agent definition object
 *   - string: Path to a Markdown agent file (.md) - requires markdown-loader plugin
 *
 * @param options - Optional configuration for mcpc()
 *   - plugins: Plugins to load before resolving compose inputs (e.g., markdown-loader)
 *
 * @returns A configured MCP Server instance ready to connect to a transport
 *
 * @see {@link ComposeDefinition} for detailed composition configuration options
 * @see {@link ToolPlugin} for plugin development guide
 * @see https://github.com/mcpc-tech/mcpc/tree/main/docs for complete documentation
 */
export async function mcpc(
  serverConf: ConstructorParameters<typeof ComposableMCPServer>,
  composeConf?: ComposeInput[],
  optionsOrSetup?:
    | McpcOptions
    | ((server: ComposableMCPServer) => void | Promise<void>),
): Promise<InstanceType<typeof ComposableMCPServer>> {
  const server = new ComposableMCPServer(...serverConf);

  // Normalize options (support both callback and options object for backwards compatibility)
  const options: McpcOptions = typeof optionsOrSetup === "function"
    ? { setup: optionsOrSetup }
    : (optionsOrSetup ?? {});

  // Load loader plugins first (before resolving compose inputs)
  // These plugins register file loaders (e.g., markdown-loader) needed to parse file paths
  // Note: Runtime plugins in ComposeDefinition.plugins are loaded later, after composition
  if (options.plugins) {
    for (const plugin of options.plugins) {
      await server.addPlugin(plugin);
    }
  }

  // Resolve all compose inputs (file paths and inline definitions) in parallel
  const resolvedConfigs = composeConf
    ? await Promise.all(composeConf.map(resolveComposeInput))
    : [];
  const parsed = parseMcpcConfigs(resolvedConfigs);

  // Initialize built-in plugins first (e.g., large result handler, search plugin)
  await server.initBuiltInPlugins();

  // Load runtime plugins from compose definitions (ComposeDefinition.plugins)
  // These plugins transform tool descriptions, results, and behavior at runtime
  for (const mcpcConfig of parsed) {
    if (mcpcConfig.plugins) {
      for (const plugin of mcpcConfig.plugins) {
        if (typeof plugin === "string") {
          // Load global plugin from file path (supports query params like ?maxSize=8000)
          await server.loadPluginFromPath(plugin);
        } else {
          // Register global plugin object directly
          await server.addPlugin(plugin);
        }
      }
    }
  }

  // Allow user to register custom tools or perform additional setup before composing
  if (options.setup) {
    await options.setup(server);
  }

  // Compose each agent by connecting to MCP dependencies and creating the agentic tool
  // This process:
  // 1. Parses tool references from the description
  // 2. Connects to dependent MCP servers (stdio, sse, streamable-http)
  // 3. Selects and composes referenced tools
  // 4. Creates the final agentic tool with chosen execution mode
  for (const mcpcConfig of parsed) {
    await server.compose(
      mcpcConfig.name,
      mcpcConfig.description ?? "",
      mcpcConfig.deps,
      mcpcConfig.options,
    );
  }

  return server;
}
