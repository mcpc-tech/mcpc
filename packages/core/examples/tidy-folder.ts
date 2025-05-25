import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
      name: "tidy-folder",
      description: `Goal: Automatically keep the users folder tidy, organized, and free from clutter by intelligently classifying(with folders) and managing files(moving to corresponding folder).
Tools: <tool name="@wonderwhy-er/desktop-commander.list_directory"/> , <tool name="@wonderwhy-er/desktop-commander.create_directory"/> , <tool name="@wonderwhy-er/desktop-commander.move_file"/> 
`,
      deps: {
        mcpServers: {
          "@wonderwhy-er/desktop-commander": {
            command: "npx",
            args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          },
        },
      },
    },
  ]
);

const transport = new StdioServerTransport();
await server.connect(transport);
