import { ComposableMCPServer } from "../mod.ts";

export const INCOMING_MSG_ROUTE_PATH = "/core/messages";

export function setUpMcpServer(
  ...args: ConstructorParameters<typeof ComposableMCPServer>
): InstanceType<typeof ComposableMCPServer> {
  const server = new ComposableMCPServer(...args);

  server.compose(
    "co-calculator",
    `When mathematical statistics or logical calculations are needed, complete the calculation by following these steps:
1. Use <tool name="code-runner.python-code-runner"/> to execute the calculation code
2. Return the calculation result.`,
    {
      mcpServers: {
        "code-runner": {
          command: "deno",
          args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
          env: {
            // DENO_PERMISSION_ARGS: "--allow-net",
          },
          transportType: "stdio",
        },
      },
    }
  );

  server.compose(
    "if-takeout-has-physical-store",
    `Before ordering takeout, check if the restaurant has a physical store using Amap data:
0. Use <tool name="amap-maps.maps_geo"/> tool to get user location coordinates;
1. Use <tool name="amap-maps.maps_text_search"/> tool to search with user provided keywords, find the most matching restaurant by default;
2. Use <tool name="amap-maps.maps_geo"/> tool to get restaurant coordinates;
3. Use <tool name="amap-maps.maps_distance"/> to calculate driving distance from restaurant to user location;
4. If distance is less than or equal to 20000, return "Has physical store"; otherwise, return "No physical store"; append distance and driving time (convert to readable format, like "10km 20min")`,
    {
      mcpServers: {
        "amap-maps": {
          command: "npx",
          args: ["-y", "@amap/amap-maps-mcp-server"],
          env: {
            AMAP_MAPS_API_KEY: process.env.AMAP_MAPS_API_KEY,
          },
        },
      },
    }
  );

  return server;
}
