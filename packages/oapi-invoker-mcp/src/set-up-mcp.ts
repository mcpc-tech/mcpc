import { ComposableMCPServer } from "@mcpc/core";

import { parseOAPISpecWithExtensions } from "./tool/parser.ts";
import { openapiToAIToolSchema } from "./tool/translator.ts";
import { invoke } from "./tool/invoker.ts";
import { Schema } from "ai";

export const INCOMING_MSG_ROUTE_PATH = "/oapi/messages";

const specification = await parseOAPISpecWithExtensions({});

const { standardTools, toolToExtendInfo } = await openapiToAIToolSchema(
  specification
);

export function setUpMcpServer(
  ...args: ConstructorParameters<typeof ComposableMCPServer>
): InstanceType<typeof ComposableMCPServer> {
  const server = new ComposableMCPServer(...args);

  standardTools.map((tool) => {
    console.log(tool.name);
    server.tool(
      tool.name,
      tool.description ?? "",
      tool.inputSchema as unknown as Schema,
      async (inputParams, extra) => {
        const res = await invoke(
          specification,
          toolToExtendInfo[tool.name],
          inputParams as any
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res.data),
            },
          ],
        };
      }
    );
  });

  return server;
}
