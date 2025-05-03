import { jsonSchema, Schema, zodSchema } from "ai";
import {
  ComposableMCPServer,
  composeMcpDepTools,
  isProdEnv,
  p,
  parseTags,
  registerDepTools,
} from "../mod.ts";
import { z } from "zod";
import { jsonSchemaToZod } from "json-schema-to-zod";
import { ZodDiscriminatedUnionOption } from "zod";

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
  ...args: ConstructorParameters<typeof ComposableMCPServer>
): InstanceType<typeof ComposableMCPServer> {
  const server = new ComposableMCPServer(...args);

  server.tool(
    "google_search",
    "Search web",
    zodSchema(
      //TODO: Whether to use this is dep on whether one input is depooned on
      z.discriminatedUnion(
        "step",
        tagToResults.tool.map((v, index) => {
          return eval(
            jsonSchemaToZod(tools[v.attribs.name].parameters.jsonSchema)
          )
            .merge(
              z.object({
                step: z.literal(index),
              })
            )
            .merge(
              index === 0
                ? z.object({
                    query: z.string().describe("The query to search"),
                  })
                : z.object({})
            );
        }) as unknown as readonly [
          ZodDiscriminatedUnionOption<"step">,
          ...ZodDiscriminatedUnionOption<"step">[]
        ]
      )
    ).jsonSchema as Schema,
    async (args: any) => {
      for (const f of tagToResults.fn) {
        onePouch = onePouch.replace(
          $(f).prop("outerHTML")!,
          funcNameToValue[f.attribs.name as keyof typeof funcNameToValue]?.(
            args.query
          )
        );
      }

      const currentToolElement = tagToResults.tool[args.step ?? 0];
      const currentTool = tools[currentToolElement.attribs.name];
      const currentResult = await currentTool.execute({
        ...args,
        step: undefined,
      });

      const nextStep = args.step + 1;

      if (tagToResults.tool.length > nextStep) {
        currentResult?.content?.unshift({
          type: "text",
          text: `**Next Action: You MUST call this tool(\`google_search\`) with step=${nextStep}, considering the following result: **`,
        });
      }

      if (args.step === 0) {
        currentResult?.content?.unshift({
          type: "text",
          text: onePouch,
        });
      }

      return currentResult;
    }
  );

  return server;
  return registerDepTools(server, tools);
}
