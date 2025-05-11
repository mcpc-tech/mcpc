import { StdioServerTransport } from "@modelcontextprotocol/sdk";
import { mcpc } from "../mod.ts";

export const server = await mcpc(
  [
    {
      name: "mcpc",
      version: "0.1.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
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
  ]
);

const transport = new StdioServerTransport();
await server.connect(transport);
