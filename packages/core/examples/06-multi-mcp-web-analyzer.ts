/**
 * MCPC Example 06: Multi-MCP Web Analyzer
 *
 * Demonstrates integration of multiple MCP servers for complex web
 * analysis workflows combining browser automation, code execution,
 * and file operations.
 *
 * Features:
 * - Multi-MCP server integration
 * - Complex workflow orchestration
 * - Web scraping and analysis
 * - Data processing and reporting
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../mod.ts";

export const server = await mcpc({
  name: "multi-mcp-web-analyzer",
  version: "1.0.0",
  capabilities: { tools: { listChanged: true } },

  agents: [
    {
      name: "web-analyzer",
      mode: "agentic",

      description:
        `I am a comprehensive web analyzer that combines multiple MCP servers to perform sophisticated web content analysis and reporting.

**Browser Automation Tools:**
<tool name="@microsoft/playwright-mcp.browser_navigate"/>
<tool name="@microsoft/playwright-mcp.browser_screenshot"/>
<tool name="@microsoft/playwright-mcp.browser_get_page_content"/>
<tool name="@microsoft/playwright-mcp.browser_click"/>
<tool name="@microsoft/playwright-mcp.browser_type"/>
<tool name="@microsoft/playwright-mcp.browser_close"/>

**Code Execution Tools:**
<tool name="code-runner.python-code-runner"/>
<tool name="code-runner.javascript-code-runner"/>

**File Management Tools:**
<tool name="@wonderwhy-er/desktop-commander.write_file"/>
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory"/>
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>

**Analysis Capabilities:**
- **Content Analysis:** Extract and analyze text, links, images, and metadata
- **SEO Analysis:** Check title tags, meta descriptions, headers, and keyword density
- **Performance Analysis:** Measure page load times and resource usage
- **Accessibility Analysis:** Check WCAG compliance and accessibility features
- **Security Analysis:** Identify potential security issues and vulnerabilities
- **Mobile Responsiveness:** Test and analyze mobile compatibility
- **Social Media Integration:** Analyze social sharing features and metadata

**Data Processing:**
- **Text Processing:** Natural language processing and sentiment analysis
- **Data Extraction:** Structured data extraction from web pages
- **Statistical Analysis:** Performance metrics and comparative analysis
- **Visualization:** Generate charts and graphs for insights
- **Report Generation:** Comprehensive analysis reports in multiple formats

**Workflow Integration:**
I intelligently coordinate between browser automation, data processing, and file operations to:
1. Navigate and interact with websites systematically
2. Extract comprehensive data using multiple techniques
3. Process and analyze data using advanced algorithms
4. Generate professional reports with visualizations
5. Save results in organized, accessible formats

**Output Formats:**
- Detailed HTML reports with interactive elements
- JSON data exports for further processing
- CSV files for spreadsheet analysis
- PDF reports for sharing and presentation
- Screenshots and visual documentation`,

      mcpServers: {
        "@microsoft/playwright-mcp": {
          command: "npx",
          args: ["@playwright/mcp@latest", "--image-responses=emit"],
        },
        "code-runner": {
          command: "deno",
          args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
        },
        "@wonderwhy-er/desktop-commander": {
          command: "npx",
          args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
        },
      },
    },
  ],
});

await server.connect(new StdioServerTransport());
