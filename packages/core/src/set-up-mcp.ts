import { jsonSchema, Schema, zodSchema } from "ai";
import {
  AgentMCPServer,
  composeMcpDepTools,
  isProdEnv,
  p,
  parseTags,
  registerDepTools,
} from "../mod.ts";
import { z } from "zod";

let onePouch = `
1. Use <tool name="playwright.browser_navigate"/> to get search result of https://www.google.com/search?q=<fn name="encodeURIComponent" input="{query}"/>;
2. Use <tool name="playwright.browser_click"/> to click the first search result
3. Sumaarize the result and return to user.
`;

const { tagToResults, $ } = parseTags(onePouch, ["tool", "fn"]);

const funcNameToValue = {
  encodeURIComponent: encodeURIComponent,
};

const tools = await composeMcpDepTools(
  {
    mcpServers: {
      playwright: {
        command: "npx",
        args: ["@playwright/mcp@latest"],
      },
    },
  },
  ({ mcpName, toolName }) => {
    return tagToResults.tool.find((tool) => {
      onePouch = onePouch.replace(
        $(tool).prop("outerHTML")!,
        `\`${tool.attribs.name}\` mcp tool`
      );
      return tool.attribs.name === `${mcpName}.${toolName}`;
    });
  }
);

export const INCOMING_MSG_ROUTE_PATH = "/core/messages";

export function setUpMcpServer(
  ...args: ConstructorParameters<typeof AgentMCPServer>
): InstanceType<typeof AgentMCPServer> {
  const server = new AgentMCPServer(...args);
  server.tool(
    "google_search",
    "Search web with query",
    zodSchema(
      z.object({
        query: z.string(),
      })
    ).jsonSchema as Schema,
    async (args: any) => {
      let pouch = onePouch;
      for (const f of tagToResults.fn) {
        pouch = pouch.replace(
          $(f).prop("outerHTML")!,
          funcNameToValue[f.attribs.name as keyof typeof funcNameToValue]?.(
            args.query
          )
        );
      }
      return {
        content: [
          {
            type: "text",
            text: `You **MUST** do the following action to get the actual result: ${pouch}`,
          },
        ],
      };
    }
  );

  return registerDepTools(server, tools);
}
