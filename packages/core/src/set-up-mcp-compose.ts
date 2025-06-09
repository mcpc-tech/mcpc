import { ComposableMCPServer } from "../mod.ts";
import minimist from "minimist";
import { connectToSmitheryServer } from "./utils/common/registory.ts";
import { MCPSetting } from "./service/tools.ts";

export const INCOMING_MSG_ROUTE_PATH = "/core/messages";

export interface ComposeDefination {
  name: string;
  description: string;
  deps: MCPSetting;

  options?: {
    /**
     * @default workflow
     */
    mode?: "agentic" | "workflow" | "static_workflow";
  };
}

export interface ComposibleMCPConfig {
  [key: string]: ComposeDefination[];
}

const examples: ComposibleMCPConfig = {
  example: [
    {
      name: "co-calculator",
      description: `When mathematical statistics or logical calculations are needed, complete the calculation by following these steps:
1. Use <tool name="code-runner.python-code-runner"/> to execute the calculation code
2. Return the calculation result.`,
      deps: {
        mcpServers: {
          "code-runner": {
            command: "deno",
            args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
            env: {},
            transportType: "stdio",
          },
        },
      },
    },
  ],
};

export function parseMcpcConfigs(
  conf?: ComposeDefination[]
): ComposeDefination[] {
  const mcpcConfigRaw =
    minimist(process.argv.slice(2))?.["mcpc-config"] ??
    process.env.MCPC_CONFIG ??
    JSON.stringify(examples["example"]);
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
