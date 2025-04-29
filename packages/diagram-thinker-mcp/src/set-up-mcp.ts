import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";
import { render } from "@pintora/target-wintercg";
import { p } from "@mcpc/core";
import { generateId } from "ai";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import process from "node:process";
import { z } from "zod";

export const INCOMING_MSG_ROUTE_PATH = "/diagram-thinker/messages";

export const SVG_PATH_PREFIX = join("/tmp", tmpdir());

mkdirSync(SVG_PATH_PREFIX, { recursive: true });

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: Parameters<InstanceType<typeof McpServer>["tool"]>[3];
};

export function setUpMcpServer(
  ...args: ConstructorParameters<typeof McpServer>
): InstanceType<typeof McpServer> {
  const server = new McpServer(...args);

  server.tool(
    "Create Mind Map",
    p(
      `Create a mind map from the given text using Pintora(Mind Map syntax is based on PlantUML MindMap beta.)
The code parameter examples:
1. OrgMode syntax for levels
> You can specify node level by number of * symobl, starting from 1:
mindmap
title: Mind Map levels
* UML Diagrams
** Behavior Diagrams
*** Sequence Diagram
*** State Diagram
2. +/- symbol for side
> Normally the diagram layout is from left to right, you can use - symbol to choose another side.
mindmap
+ UML Diagrams
++ Behavior Diagrams
+++ Sequence Diagram
+++ State Diagram
+++ Activity Diagram
-- Structural Diagrams
--- Class Diagram
--- Component Diagram
3. Multiline text
> You can use : and ; to have multilines box.
mindmap
* example
** :can have multiline
text;
4. Multiroot
> You can create multiroot mind map, every node with depth 1 will create a new tree.
mindmap
* UML Diagram
** Sequence Diagram
** State Diagram
** Component Diagram
* Non-UML Diagram
** Entity Relationship Diagram
** Mind Map
5. Override config
> You can override diagram config through @param directive. All available configs can be seen in the Config page.
mindmap
@param layoutDirection TB
@param {
  l1NodeBgColor   #2B7A5D
  l1NodeTextColor #fff
  l2NodeBgColor   #26946C
  l2NodeTextColor #fff
  nodeBgColor     #67B599
  textColor       #fff
}
+ UML Diagrams
++ Behavior Diagrams
+++ Sequence Diagram
+++ State Diagram
+++ Activity Diagram
++ Structural Diagrams
+++ Class Diagram
+++ Component Diagram
`
      // @ts-ignore
    )({}),
    {
      code: z.string().describe("The code parameter for the mind map"),
    },
    async (args, extra) => {
      const code = args.code as string;
      const res = await render({ code });
      const id = generateId();
      writeFileSync(`${SVG_PATH_PREFIX}/${id}.svg`, res.data);
      console.log(`[diagram-thinker] svg file generated: ${id}.svg`);

      return {
        content: [
          {
            type: "text",
            text: `Successfully generated. Link ![result](http://${
              process.env.SERVER_ORIGIN || "localhost:9000"
            }/diagram-thinker/${id}.svg)`,
          },
        ],
      };
    }
  );

  return server;
}
