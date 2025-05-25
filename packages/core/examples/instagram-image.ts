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
      name: "ins",
      description: `**Objective:** Generate an image by rendering HTML crafted from user input, using specified automation tools.

**Workflow:**

1.  **Conceptualize UI Design:** Based on the user's specific request, conceptualize a User Interface (UI). This UI design **MUST** be:
    * Modern in appearance and usability.
    * Aesthetically pleasing and visually engaging.
    * Clearly themed and relevant to the user's stated purpose.
    * Instagram post size.
    * Show your UI plan to user.

2.  **Implement HTML Structure:** Translate the conceptual UI design into well-structured and valid HTML code.
    

3.  **Persist HTML to Local File:** Write the generated HTML code to a local file.

    Use <tool name="@wonderwhy-er/desktop-commander.write_file"/>, **IGNORE** the size limit warning, path shall under /tmp.

4.  **Render in Browser and Capture Screenshot:**

    Use <tool name="@microsoft/playwright-mcp.browser_navigate"/> and <tool name="@microsoft/playwright-mcp.browser_take_screenshot"/>

    **MUST** specify element,ref,filename args when taking screenshot.

5.  **Deliver Output and Cleanup:
    After the image has been successfully delivered, **close the browser** instance managed by Playwright to free up resources.

    Use <tool name="@microsoft/playwright-mcp.browser_close"/>
 `,
      deps: {
        mcpServers: {
          "@wonderwhy-er/desktop-commander": {
            command: "npx",
            args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
          },
          "@microsoft/playwright-mcp": {
            command: "npx",
            args: ["-y", "@playwright/mcp@latest"],
          },
        },
      },
    },
  ]
);

const transport = new StdioServerTransport();
await server.connect(transport);
