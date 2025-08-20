/**
 * Simple Large Result Plugin Demo
 *
 * This is the simplest possible example showing how large results
 * are automatically handled by the plugin.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../src/set-up-mcp-compose.ts";
// import { createLargeResultPlugin } from "../plugins.ts";
import { jsonSchema } from "ai";

const server = await mcpc(
  [{ name: "large-demo", version: "1.0.0" }, { capabilities: { tools: {} } }],
  [
    {
      name: "large-output-handler",
      options: { mode: "agentic_workflow" },
      description:
        "Agent that demonstrates automatic large output handling and file storage",
      plugins: [
        "./plugins/large-result.ts?maxSize=8000&previewSize=4000",
        // create a large result plugin instance
        // createLargeResultPlugin(),
      ],
    },
  ],
  (server) => {
    // Tool that makes big output
    server.tool(
      "make-big-text",
      "Create large text output",
      jsonSchema<{ lines?: number }>({
        type: "object",
        properties: {
          lines: { type: "number", description: "How many lines to generate" },
        },
      }),
      (args) => {
        const lines = args.lines || 500;
        let text = "";
        for (let i = 1; i <= lines; i++) {
          text += `Line ${i}: Some example text here\n`;
        }
        return { content: [{ type: "text", text }] };
      },
      { internal: true }
    );
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

/*
Usage Examples:

1. Small output (not stored):
   > "Make small text"

2. Large output (automatically stored):
   > "Make big text with 1000 lines"

3. Search stored files:
   > "Search for 'Line 500' in files"

The plugin automatically:
- Detects when output > 8KB
- Saves to temp files
- Shows preview + search instructions
- Provides search-files tool
*/
