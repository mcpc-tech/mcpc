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

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Key Features of Agentic Mode:
 *
 * 1. **Complete Autonomy:**
 *    - Agent decides the sequence of actions
 *    - No predefined workflow steps
 *    - Adapts approach based on context
 *
 * 2. **Dynamic Decision Making:**
 *    - Evaluates data structure first
 *    - Chooses appropriate analysis techniques
 *    - Adjusts strategy based on findings
 *
 * 3. **Flexible Tool Usage:**
 *    - Uses tools in any order as needed
 *    - Can repeat or skip steps dynamically
 *    - Optimizes workflow for efficiency
 *
 * 4. **Intelligent Analysis:**
 *    - Detects data types and patterns automatically
 *    - Suggests appropriate visualizations
 *    - Identifies potential issues and solutions
 *
 * Example Usage:
 *
 * User: "Analyze the sales data in /data/sales.csv"
 *
 * Agent autonomously:
 * 1. Explores the data structure and quality
 * 2. Performs cleaning and preprocessing as needed
 * 3. Conducts statistical analysis
 * 4. Creates relevant visualizations
 * 5. Generates insights and recommendations
 * 6. Saves results and reports
 *
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "data-analyst": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "02-agentic-data-analyst.ts"]
 *     }
 *   }
 * }
 * ```
 */
