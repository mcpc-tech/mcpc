import { ComposableMCPServer } from "../mod.ts";
import minimist from "minimist";
import { connectToSmitheryServer } from "./utils/common/registory.ts";
import type { MCPCStep } from "./utils/state.ts";
import type { MCPSetting } from "./service/tools.ts";
import process from "node:process";
import type { SamplingConfig, ToolPlugin } from "./types.ts";

export const INCOMING_MSG_ROUTE_PATH = "/core/messages";

export interface ComposeDefinition {
  name: string;
  description: string;
  deps?: MCPSetting;

  /**
   * Plugins to load and apply to tools
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
  };
}

export interface ComposibleMCPConfig {
  [key: string]: ComposeDefinition[];
}

export function parseMcpcConfigs(
  conf?: ComposeDefinition[],
): ComposeDefinition[] {
  const mcpcConfigRaw = minimist(process.argv.slice(2))?.["mcpc-config"] ??
    process.env.MCPC_CONFIG;
  const mcpcConfigs = conf ?? JSON.parse(mcpcConfigRaw);
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

  // Load plugins first
  for (const mcpcConfig of parsed) {
    if (mcpcConfig.plugins) {
      for (const plugin of mcpcConfig.plugins) {
        if (typeof plugin === "string") {
          // Load plugin from file
          await server.loadPlugin(plugin);
        } else {
          // Register plugin object directly
          server.addPlugin(plugin);
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
      mcpcConfig.description,
      mcpcConfig.deps,
      mcpcConfig.options,
    );
  }

  return server;
}
