/**
 * MCPC Example 03: Workflow Image Generator
 *
 * Demonstrates agentic workflow mode with predefined steps for creating
 * images by rendering HTML/CSS designs through browser automation.
 *
 * Features:
 * - Structured workflow with predefined steps
 * - Step-by-step execution with state tracking
 * - Browser automation for image generation
 * - HTML/CSS rendering pipeline
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../mod.ts";

export const server = await mcpc(
  [
    {
      name: "workflow-image-generator",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "image-generator",

      options: {
        mode: "agentic_workflow",
        // Predefined workflow steps for predictable execution
        steps: [
          {
            description:
              "Generate complete HTML and CSS code for the image design using modern web technologies, responsive design principles, and accessibility best practices.",
            actions: ["@wonderwhy-er/desktop-commander.write_file"],
          },
          {
            description:
              "Open a browser instance and navigate to the generated HTML file to render the design in a controlled environment.",
            actions: ["@microsoft/playwright-mcp.browser_navigate"],
          },
          {
            description:
              "Capture a high-quality screenshot of the rendered design with proper dimensions and formatting for the intended use case.",
            actions: ["@microsoft/playwright-mcp.browser_take_screenshot"],
          },
          {
            description:
              "Clean up browser resources, validate the generated image quality, and present the final result to the user with file location.",
            actions: ["@microsoft/playwright-mcp.browser_close"],
          },
        ],
      },

      description:
        `**Objective:** Generate high-quality images by creating and rendering HTML/CSS designs through a structured workflow.

**Design Capabilities:**
- Modern CSS layouts with Flexbox and Grid
- Responsive design that adapts to different sizes
- Beautiful typography and color schemes
- Icons, graphics, and visual elements
- Social media post formats (Instagram, Twitter, LinkedIn)
- Presentations slides and infographics
- Business cards and marketing materials
- Web graphics and banners

**Technical Features:**
- CSS animations and transitions
- Custom fonts and typography
- SVG graphics and icons
- Gradient backgrounds and effects
- Modern design patterns and layouts
- Accessibility compliance (WCAG guidelines)
- Cross-browser compatibility

**Output Formats:**
- High-resolution PNG images
- Scalable designs for different devices
- Print-ready formats with proper DPI
- Web-optimized graphics

**Quality Standards:**
- Pixel-perfect rendering
- Professional design aesthetics
- Attention to detail and polish
- Brand consistency and guidelines
- User experience best practices

**Workflow Benefits:**
- Predictable step-by-step execution
- State tracking and progress monitoring
- Error recovery and validation
- Consistent output quality
- Reproducible results

Present final images using ![image](path) syntax and provide file locations.`,

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
    },
  ],
);

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Key Features of Agentic Workflow Mode:
 *
 * 1. **Predefined Steps:**
 *    - Clear sequence of operations
 *    - Predictable and repeatable execution
 *    - Strong governance and compliance
 *
 * 2. **State Management:**
 *    - Automatic step progression tracking
 *    - Built-in error handling and recovery
 *    - Progress monitoring and debugging
 *
 * 3. **Structured Execution:**
 *    - Each step has defined actions and purpose
 *    - Validation between steps
 *    - Consistent output quality
 *
 * 4. **Professional Workflow:**
 *    - Design → Code → Render → Capture → Present
 *    - Quality assurance at each stage
 *    - Resource management and cleanup
 *
 * Example Usage:
 *
 * User: "Create an Instagram post about coffee with a modern, minimalist design"
 *
 * Workflow execution:
 * [Step 1] Planning modern minimalist coffee post design...
 * [Step 2] Generating HTML/CSS code with clean typography...
 * [Step 3] Opening browser and loading the design...
 * [Step 4] Capturing high-quality screenshot...
 * [Step 5] Cleaning up and presenting final image...
 *
 * Result: ![image](/tmp/coffee-post.png)
 *
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "image-generator": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "03-workflow-image-generator.ts"]
 *     }
 *   }
 * }
 * ```
 */
