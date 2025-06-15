import type { ComposeDefination } from "../mod.ts";

export const insImageGen: ComposeDefination = {
  name: "ins",
  options: {
    mode: "agentic_workflow",
  },
  description: `**Objective:** Generate an image by rendering HTML crafted from user input, using specified automation tools.

**Workflow:**

1.  **Conceptualize UI Design:** Based on the user's specific request, conceptualize a User Interface (UI). This UI design **MUST** be:
    * Modern in appearance and usability.
    * Aesthetically pleasing and visually engaging.
    * Clearly themed and relevant to the user's stated purpose.
    * Instagram post size.
    * Show your UI plan to user.

2.  **Implement HTML Structure:** Translate the conceptual UI design into well-structured and valid HTML code.
    * Utilizing **Tailwind CSS** for styling.

3.  **Persist HTML to Local File:** Write the generated HTML code to a local file.

    Use <tool name="@wonderwhy-er/desktop-commander.write_file"/>, path must under /tmp.

4.  **Navigate to HTML File:**

    Use <tool name="@microsoft/playwright-mcp.browser_navigate"/>

5.  **Capture Screenshot:**

    Use <tool name="@microsoft/playwright-mcp.browser_take_screenshot"/>

**MUST** specify element, ref, and filename arguments when taking a screenshot. The filename is a path, and it must be under /tmp.

6.  **Deliver Output and Cleanup:**
    After the image has been successfully delivered, **close the browser** instance managed by Playwright to free up resources.

    Use <tool name="@microsoft/playwright-mcp.browser_close"/>

Remember to show the user generated image using ![image][{filename}] syntax
  `,
  deps: {
    mcpServers: {
      "@wonderwhy-er/desktop-commander": {
        command: "npx",
        args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      },
      "@microsoft/playwright-mcp": {
        command: "npx",
        args: ["@playwright/mcp@latest", "--image-responses=emit"],
      },
    },
  },
};

export const insImageGenWorkflow: ComposeDefination = {
  name: "ins",
  options: {
    mode: "agentic_workflow",
    steps: [
      {
        description:
          "Conceptualize the UI design and generate the complete HTML and CSS code based on the user's request.",
        actions: ["reasoning"],
      },
      {
        description:
          "Write the generated HTML code to a temporary file in the /tmp directory.",
        actions: ["@wonderwhy-er/desktop-commander.write_file"],
      },
      {
        description:
          "Launch a browser instance and navigate to the created local HTML file.",
        actions: ["@microsoft/playwright-mcp.browser_navigate"],
      },
      {
        description:
          "Take a screenshot of the rendered UI element and save it to a file in the /tmp directory.",
        actions: ["@microsoft/playwright-mcp.browser_take_screenshot"],
      },
      {
        description:
          "Close the browser to free up resources and present the final image to the user.",
        actions: ["@microsoft/playwright-mcp.browser_close"],
      },
    ],
  },
  description: `**Objective:** Generate an image by rendering HTML crafted from user input, using specified automation tools.

Requirements: 

* Utilizing **Tailwind CSS** for styling.
* Modern in appearance and usability.
* Aesthetically pleasing and visually engaging.
* Clearly themed and relevant to the user's stated purpose.
* Instagram post size.
* Show your UI plan to user.

Remember to show the user generated image using ![image][{filename}] syntax`,
  deps: {
    mcpServers: {
      "@wonderwhy-er/desktop-commander": {
        command: "npx",
        args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      },
      "@microsoft/playwright-mcp": {
        command: "npx",
        args: ["@playwright/mcp@latest", "--image-responses=emit"],
      },
    },
  },
};
