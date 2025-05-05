import { ComposableMCPServer } from "../mod.ts";
import minimist from "minimist";
import { connectToSmitheryServer } from "./utils/common/registory.ts";

export const INCOMING_MSG_ROUTE_PATH = "/core/messages";

// Examples: when command line args --mcpc-config are not provided, these serve as default examples
const examples = {
  mcpc: [
    {
      name: "search-mcp-servers",
      description:
        'search mcp servers using <tool name="@smithery/toolbox.search_servers"/>',
      deps: {
        mcpServers: {
          "@smithery/toolbox": {
            smitheryConfig: {
              type: "http",
              deploymentUrl: "https://server.smithery.ai/@smithery/toolbox/mcp",
              config: {
                dynamic: false,
                profile: "gentle-beaver-73GCYS",
                smitheryApiKey: process.env.SMITHERY_API_TOKEN,
              },
            },
          },
        },
      },
    },
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
    {
      name: "if-takeout-has-physical-store",
      description: `Before ordering takeout, check if the restaurant has a physical store using Amap data:
0. Use <tool name="amap-maps.maps_geo"/> tool to get user location coordinates;
1. Use <tool name="amap-maps.maps_text_search"/> tool to search with user provided keywords, find the most matching restaurant by default;
2. Use <tool name="amap-maps.maps_geo"/> tool to get restaurant coordinates;
3. Use <tool name="amap-maps.maps_distance"/> to calculate driving distance from restaurant to user location;
4. If distance is less than or equal to 20000, return "Has physical store"; otherwise, return "No physical store"; append distance and driving time (convert to readable format, like "10km 20min")`,
      deps: {
        mcpServers: {
          "amap-maps": {
            command: "npx",
            args: ["-y", "@amap/amap-maps-mcp-server"],
            env: {
              AMAP_MAPS_API_KEY: process.env.AMAP_MAPS_API_KEY,
            },
          },
        },
      },
    },
  ],
};

function parseMcpcConfigs() {
  const mcpcConfigRaw =
    minimist(process.argv.slice(2))?.["mcpc-config"] ??
    JSON.stringify(examples["mcpc"]);
  console.log(mcpcConfigRaw);
  const mcpcConfigs = mcpcConfigRaw ? JSON.parse(mcpcConfigRaw) : null;
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

const mcpcConfigs = parseMcpcConfigs();

export async function setUpMcpServer(
  ...args: ConstructorParameters<typeof ComposableMCPServer>
): Promise<InstanceType<typeof ComposableMCPServer>> {
  const server = new ComposableMCPServer(...args);

  for (const mcpcConfig of mcpcConfigs) {
    await server.compose(
      mcpcConfig.name,
      mcpcConfig.description,
      mcpcConfig.deps
    );
  }

  return server;
}
