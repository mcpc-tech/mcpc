/**
 * MCPC Example 02: Agentic Data Analyst
 *
 * Demonstrates the agentic execution mode where the agent has complete
 * autonomy to orchestrate actions in any order based on the situation.
 *
 * Features:
 * - Fully autonomous agentic mode
 * - Self-directed workflow based on context
 * - Maximum flexibility and adaptability
 * - Data analysis and visualization capabilities
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../mod.ts";

export const server = await mcpc(
  [
    {
      name: "agentic-data-analyst",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "data-analyst",

      // Agentic mode for complete autonomy
      options: {
        mode: "agentic",
      },

      description:
        `I am an autonomous data analyst that can perform comprehensive data analysis with complete freedom to orchestrate my actions.

Available tools:
<tool name="code-runner.python-code-runner"/>
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory"/>

I can autonomously:
- Load and explore datasets from various formats (CSV, JSON, Excel, TSV)
- Perform statistical analysis and data cleaning
- Create visualizations and charts using matplotlib, seaborn, plotly
- Generate comprehensive analysis reports with insights
- Make data-driven recommendations
- Handle missing data and outliers intelligently
- Perform correlation analysis and hypothesis testing
- Create interactive dashboards and visualizations

I decide the order of operations dynamically based on:
- The nature and structure of the data
- Quality and completeness of the dataset
- Specific analysis requirements
- Discovered patterns and anomalies
- User preferences and goals

My autonomous approach ensures thorough analysis tailored to each unique dataset.`,

      deps: {
        mcpServers: {
          "code-runner": {
            command: "deno",
            args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
            transportType: "stdio",
          },
          "@wonderwhy-er/desktop-commander": {
            command: "npx",
            args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
            transportType: "stdio",
          },
        },
      },
    },
  ],
);

await server.connect(new StdioServerTransport());
