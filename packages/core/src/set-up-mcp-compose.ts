import { ComposableMCPServer } from "../mod.ts";
import minimist from "minimist";
import { connectToSmitheryServer } from "./utils/common/registory.ts";
import { MCPCStep } from "./utils/state.ts";
import { MCPSetting } from "./service/tools.ts";
import { insImageGen } from "../examples/def.ts";

export const INCOMING_MSG_ROUTE_PATH = "/core/messages";

export interface ComposeDefination {
  name: string;
  description: string;
  deps?: MCPSetting;

  options?: {
    /**
     * Execution mode for the agent
     * - "agentic": Fully autonomous agent mode without any workflow structure
     * - "agentic_workflow": Agent workflow mode that can either generate steps at runtime or use predefined steps
     * @default "agentic"
     */
    mode?: "agentic" | "agentic_workflow";

    /**
     * Optional predefined workflow steps for agentic_workflow mode
     * - If provided: Uses these predefined steps in agentic_workflow mode
     * - If empty/undefined: Generates workflow steps dynamically at runtime in agentic_workflow mode
     * - Ignored when mode is "agentic"
     */
    steps?: MCPCStep[];
  };
}

export interface ComposibleMCPConfig {
  [key: string]: ComposeDefination[];
}

export function parseMcpcConfigs(
  conf?: ComposeDefination[]
): ComposeDefination[] {
  const mcpcConfigRaw =
    minimist(process.argv.slice(2))?.["mcpc-config"] ??
    process.env.MCPC_CONFIG ??
    JSON.stringify([insImageGen]);
  const mcpcConfigs = conf ?? JSON.parse(mcpcConfigRaw);
  const newMcpcConfigs = [];

  for (const mcpcConfig of mcpcConfigs) {
    if (mcpcConfig?.deps?.mcpServers) {
      for (const [name, config] of Object.entries<any>(
        mcpcConfig.deps.mcpServers
      )) {
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
  composeConf?: ComposeDefination[]
): Promise<InstanceType<typeof ComposableMCPServer>> {
  const server = new ComposableMCPServer(...serverConf);
  const parsed = parseMcpcConfigs(composeConf);

  for (const mcpcConfig of parsed) {
    await server.compose(
      mcpcConfig.name,
      mcpcConfig.description,
      mcpcConfig.deps,
      mcpcConfig.options
    );
  }

  return server;
}
