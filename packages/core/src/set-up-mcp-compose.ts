import { ComposableMCPServer } from "../mod.ts";
import type { MCPCStep } from "./utils/state.ts";
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
     * - "agentic": Fully autonomous agent mode without any workflow structure
     * - "agentic_workflow": Agent workflow mode that can either generate steps at runtime or use predefined steps
     * - "agentic_workflow_sampling": Autonomous sampling mode for workflow execution
     * - "ai_sampling": AI SDK sampling mode using streamText with MCP sampling provider
     * - "ai_acp": AI SDK ACP mode for coding agents (Claude Code, etc.)
     * @default "agentic"
     */
    mode?: ExecutionMode;

    /**
     * Configuration for sampling mode execution
     * Only applies when mode is "agentic_workflow_sampling"
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
     * Enable OpenTelemetry tracing
     * Applies to ai_sampling and ai_acp modes
     * @default false
     */
    tracingEnabled?: boolean;

    /**
     * Optional predefined workflow steps for agentic_workflow mode
     * - If provided: Uses these predefined steps in agentic_workflow mode
     * - If empty/undefined: Generates workflow steps dynamically at runtime in agentic_workflow mode
     * - Ignored when mode is "agentic"
     */
    steps?: MCPCStep[];

    /**
     * Actions that must be included at least once in any workflow
     * Validation will fail if these actions are not present in the workflow steps
     * - Only applies to agentic_workflow mode
     * - Ignored when mode is "agentic"
     */
    ensureStepActions?: string[];

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

// ToolRefXml is defined in ./types.ts

export interface ComposibleMCPConfig {
  [key: string]: ComposeDefinition[];
}

export function parseMcpcConfigs(
  conf?: ComposeDefinition[],
): ComposeDefinition[] {
  return conf ?? [];
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
 * await server.connect(new StdioServerTransport());
 * ```
 *
 * @param serverConf - MCP server initialization parameters including name, version, and capabilities
 *   - First element: Server metadata (name, version)
 *   - Second element: Server capabilities (tools, sampling, etc.)
 *
 * @param composeConf - Array of agent composition definitions. Each definition includes:
 *   - name: Agent name (set to null for composition-only mode)
 *   - description: Agent purpose with XML-like tool references (e.g., `<tool name="server.tool"/>`)
 *   - deps: MCP server dependencies with transport configurations (stdio, sse, streamable-http)
 *   - plugins: Global plugins to transform/extend tool behavior (objects or file paths)
 *   - options: Execution mode settings (agentic, agentic_workflow, sampling)
 *
 * @param setupCallback - Optional callback to register custom tools or perform additional setup
 *   before composition. Useful for adding internal tools or custom configurations.
 *
 * @returns A configured MCP Server instance ready to connect to a transport
 *
 * @see {@link ComposeDefinition} for detailed composition configuration options
 * @see {@link ToolPlugin} for plugin development guide
 * @see https://github.com/mcpc-tech/mcpc/tree/main/docs for complete documentation
 */
export async function mcpc(
  serverConf: ConstructorParameters<typeof ComposableMCPServer>,
  composeConf?: ComposeDefinition[],
  setupCallback?: (server: ComposableMCPServer) => void | Promise<void>,
): Promise<InstanceType<typeof ComposableMCPServer>> {
  const server = new ComposableMCPServer(...serverConf);
  const parsed = parseMcpcConfigs(composeConf);

  // Initialize built-in plugins first (e.g., large result handler, search plugin)
  await server.initBuiltInPlugins();

  // Load global plugins before composition
  // Plugins can transform tool descriptions, results, and behavior
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
  // Useful for adding internal tools or configuring server-specific behavior
  if (setupCallback) {
    await setupCallback(server);
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
