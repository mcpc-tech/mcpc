import { ComposableMCPServer } from "../mod.ts";
import { connectToSmitheryServer } from "./utils/common/registory.ts";
import type { MCPCStep } from "./utils/state.ts";
import type { MCPSetting } from "./service/tools.ts";
import type { SamplingConfig } from "./types.ts";
import type { ToolPlugin } from "./plugin-types.ts";
import type { ToolRefXml } from "./types.ts";

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
     * @default "agentic"
     */
    mode?: "agentic" | "agentic_workflow";

    /**
     * Enable MCP sampling-based autonomous execution capability
     * When enabled, adds sampling tools that can execute tasks autonomously
     * @default false
     */
    sampling?: boolean | SamplingConfig;

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
  const mcpcConfigs = conf ?? [];
  const newMcpcConfigs = [];

  for (const mcpcConfig of mcpcConfigs) {
    if (mcpcConfig?.deps?.mcpServers) {
      for (
        const [name, config] of Object.entries<any>(
          mcpcConfig.deps.mcpServers,
        )
      ) {
        if (config.smitheryConfig) {
          const streamConfig = connectToSmitheryServer(config.smitheryConfig);
          mcpcConfig.deps.mcpServers[name] = streamConfig;
        }
      }
    }
    newMcpcConfigs.push(mcpcConfig);
  }

  return newMcpcConfigs;
}

export async function mcpc(
  serverConf: ConstructorParameters<typeof ComposableMCPServer>,
  composeConf?: ComposeDefinition[],
  setupCallback?: (server: ComposableMCPServer) => void | Promise<void>,
): Promise<InstanceType<typeof ComposableMCPServer>> {
  const server = new ComposableMCPServer(...serverConf);
  const parsed = parseMcpcConfigs(composeConf);

  // Initialize built-in plugins first
  await server.initBuiltInPlugins();

  // Load global plugins before composition
  for (const mcpcConfig of parsed) {
    if (mcpcConfig.plugins) {
      for (const plugin of mcpcConfig.plugins) {
        if (typeof plugin === "string") {
          // Load global plugin from file
          await server.loadPluginFromPath(plugin);
        } else {
          // Register global plugin object directly
          await server.addPlugin(plugin);
        }
      }
    }
  }

  // Allow user to register tools before composing
  if (setupCallback) {
    await setupCallback(server);
  }

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
