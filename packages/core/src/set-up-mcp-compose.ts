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

export const INCOMING_MSG_ROUTE_PATH = "/core/messages";

export function setUpMcpServer(
  ...args: ConstructorParameters<typeof ComposableMCPServer>
): InstanceType<typeof ComposableMCPServer> {
  const server = new ComposableMCPServer(...args);

  server.compose(
    "google_search_best_result",
    `Summarize best google search result by completing the following steps(infer next action based on previous action result):
1. Use <tool name="playwright.browser_navigate"/> to get search result of https://www.google.com/search?q={query};
2. Use <tool name="playwright.browser_click"/> to click the best matching and not-ad search result
3. Summarize the result and return to user.
`,
    {
      mcpServers: {
        playwright: {
          command: "npx",
          args: ["@playwright/mcp@latest"],
          transportType: "stdio",
        },
      },
    }
  );

  server.compose(
    "co-calculator",
    `When mathematical statistics or logical calculations are needed, complete the calculation by following these steps:
1. Use <tool name="code-runner.javascript-code-runner"/> to execute the calculation code
2. Return the calculation result.
`,
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

  return server;
}
