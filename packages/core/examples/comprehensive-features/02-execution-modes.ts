/**
 * MCPC Feature Example 02: Execution Modes - Agentic vs Agentic Workflow
 * 
 * This example demonstrates the two primary execution modes in MCPC:
 * - Agentic Mode: Fully autonomous with self-orchestration
 * - Agentic Workflow Mode: Structured step-by-step execution
 * 
 * Key Concepts:
 * - Mode configuration in ComposeDefinition options
 * - Workflow step definition and execution
 * - Dynamic vs predefined workflow steps
 * - State management and progression
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc, type ComposeDefination } from "../../mod.ts";

/**
 * Example 1: Agentic Mode - Fully Autonomous Agent
 * 
 * In agentic mode, the agent has complete freedom to orchestrate actions
 * in any order based on the situation and user request.
 */
const agenticDataAnalysis: ComposeDefination = {
  name: "data-analyst-agentic",
  
  // Mode configuration - default is "agentic"
  options: {
    mode: "agentic"
  },
  
  description: `I am an autonomous data analyst that can perform comprehensive data analysis.

Available tools:
<tool name="code-runner.python-code-runner"/>
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>

I can:
- Load and explore datasets from various formats (CSV, JSON, Excel)
- Perform statistical analysis and data cleaning
- Create visualizations and charts
- Generate comprehensive analysis reports
- Make data-driven recommendations

I autonomously decide the order of operations based on the data and requirements.`,
  
  deps: {
    mcpServers: {
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
};

/**
 * Example 2: Agentic Workflow Mode - Dynamic Step Generation
 * 
 * In agentic workflow mode without predefined steps, the agent generates
 * workflow steps dynamically at runtime based on the user request.
 */
const workflowDocumentProcessor: ComposeDefination = {
  name: "document-processor-dynamic",
  
  options: {
    mode: "agentic_workflow"
    // No predefined steps - will generate dynamically
  },
  
  description: `I am a document processor that follows a structured workflow to process documents.

**Objective:** Process and analyze documents through a systematic workflow.

Available tools:
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>
<tool name="code-runner.python-code-runner"/>

**Workflow Process:**
I will dynamically generate workflow steps based on the document type and processing requirements:

1. **Document Discovery** - Identify and list available documents
2. **Content Extraction** - Read and parse document content
3. **Analysis** - Analyze content structure, key information, and metadata
4. **Processing** - Apply transformations, corrections, or enhancements
5. **Output Generation** - Create processed versions and summary reports
6. **Quality Check** - Verify output quality and completeness

The exact steps will be tailored to the specific document and requirements.`,
  
  deps: {
    mcpServers: {
      "@wonderwhy-er/desktop-commander": {
        command: "npx",
        args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      },
      "code-runner": {
        command: "deno",
        args: ["run", "--allow-all", "jsr:@mcpc/code-runner-mcp/bin"],
      },
    },
  },
};

/**
 * Example 3: Agentic Workflow Mode - Predefined Steps
 * 
 * In this mode, we define explicit workflow steps that the agent must follow
 * in sequence. This provides more structure and predictability.
 */
const workflowImageGenerator: ComposeDefination = {
  name: "image-generator-structured",
  
  options: {
    mode: "agentic_workflow",
    // Predefined workflow steps
    steps: [
      {
        description: "Analyze the user's image generation request and create a detailed design plan including layout, colors, and style requirements.",
        actions: ["reasoning"] // Special action for thinking/planning
      },
      {
        description: "Generate HTML and CSS code for the image design using modern web technologies and best practices.",
        actions: ["@wonderwhy-er/desktop-commander.write_file"]
      },
      {
        description: "Open a browser and navigate to the generated HTML file to render the design.",
        actions: ["@microsoft/playwright-mcp.browser_navigate"]
      },
      {
        description: "Capture a high-quality screenshot of the rendered design.",
        actions: ["@microsoft/playwright-mcp.browser_take_screenshot"]
      },
      {
        description: "Clean up browser resources and present the final image to the user.",
        actions: ["@microsoft/playwright-mcp.browser_close"]
      }
    ]
  },
  
  description: `**Objective:** Generate images by creating and rendering HTML/CSS designs.

**Requirements:**
- Use modern CSS and responsive design principles
- Ensure high visual quality and attention to detail
- Follow accessibility best practices
- Generate images suitable for the intended use case

**Output:** Present the final image using ![image](path) syntax and provide the file location.`,
  
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

/**
 * Example 4: Complex Multi-Step Workflow with Conditional Logic
 * 
 * Demonstrates advanced workflow features with branching and conditional execution.
 */
const workflowSystemDiagnostics: ComposeDefination = {
  name: "system-diagnostics",
  
  options: {
    mode: "agentic_workflow",
    steps: [
      {
        description: "Initialize system diagnostics and determine the scope of analysis based on user requirements.",
        actions: ["reasoning"]
      },
      {
        description: "Gather basic system information including OS, hardware specs, and running processes.",
        actions: ["code-runner.python-code-runner"]
      },
      {
        description: "Check file system health, disk space, and directory structure.",
        actions: ["@wonderwhy-er/desktop-commander.list_directory"]
      },
      {
        description: "Analyze system logs and identify potential issues or performance bottlenecks.",
        actions: ["@wonderwhy-er/desktop-commander.read_file", "code-runner.python-code-runner"]
      },
      {
        description: "Generate comprehensive diagnostic report with findings and recommendations.",
        actions: ["@wonderwhy-er/desktop-commander.write_file"]
      },
      {
        description: "If issues are found, suggest automated fixes or manual intervention steps.",
        actions: ["reasoning"]
      }
    ]
  },
  
  description: `**Objective:** Perform comprehensive system diagnostics and health checks.

**Diagnostic Areas:**
- System performance and resource utilization
- File system integrity and organization
- Log file analysis for errors or warnings
- Network connectivity and configuration
- Security status and potential vulnerabilities

**Output:** Detailed diagnostic report with actionable recommendations for system optimization.`,
  
  deps: {
    mcpServers: {
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
};

/**
 * Create servers for all execution mode examples
 */
export const agenticModeServer = await mcpc(
  [
    { name: "agentic-mode-demo", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [agenticDataAnalysis]
);

export const workflowDynamicServer = await mcpc(
  [
    { name: "workflow-dynamic-demo", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [workflowDocumentProcessor]
);

export const workflowStructuredServer = await mcpc(
  [
    { name: "workflow-structured-demo", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [workflowImageGenerator]
);

export const workflowComplexServer = await mcpc(
  [
    { name: "workflow-complex-demo", version: "1.0.0" },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [workflowSystemDiagnostics]
);

/**
 * Demonstration function showing the differences between modes
 */
async function demonstrateExecutionModes() {
  console.log("=== MCPC Execution Modes Demonstration ===\n");
  
  console.log("1. Agentic Mode:");
  console.log("   - Complete autonomy in action orchestration");
  console.log("   - Self-directed workflow based on context");
  console.log("   - Maximum flexibility and adaptability");
  console.log("   - Best for: Open-ended tasks, exploration, creative problem solving\n");
  
  console.log("2. Agentic Workflow Mode (Dynamic Steps):");
  console.log("   - Generates workflow steps at runtime");
  console.log("   - Structured approach with dynamic adaptation");
  console.log("   - Balance between structure and flexibility");
  console.log("   - Best for: Semi-structured tasks, guided exploration\n");
  
  console.log("3. Agentic Workflow Mode (Predefined Steps):");
  console.log("   - Follows explicitly defined workflow steps");
  console.log("   - Predictable and repeatable execution");
  console.log("   - Strong governance and compliance");
  console.log("   - Best for: Standard procedures, regulated processes\n");
  
  // Connect servers to demonstrate
  const transports = [
    new StdioServerTransport(),
    new StdioServerTransport(),
    new StdioServerTransport(),
    new StdioServerTransport(),
  ];
  
  await Promise.all([
    agenticModeServer.connect(transports[0]),
    workflowDynamicServer.connect(transports[1]),
    workflowStructuredServer.connect(transports[2]),
    workflowComplexServer.connect(transports[3]),
  ]);
}

/**
 * Key Learning Points:
 * 
 * 1. Mode Selection:
 *    - Choose "agentic" for maximum flexibility and autonomy
 *    - Choose "agentic_workflow" for structured execution
 *    - Consider task complexity and governance requirements
 * 
 * 2. Workflow Steps:
 *    - Define steps for predictable, repeatable processes
 *    - Use "reasoning" action for planning and analysis phases
 *    - Multiple actions per step enable complex operations
 * 
 * 3. State Management:
 *    - Workflow mode automatically manages step progression
 *    - Built-in state tracking and debugging capabilities
 *    - Error handling and recovery mechanisms
 * 
 * 4. Best Practices:
 *    - Start with agentic mode for exploration
 *    - Evolve to workflow mode as processes stabilize
 *    - Use predefined steps for mission-critical workflows
 */

export { demonstrateExecutionModes };

/**
 * Configuration Examples for Claude Desktop:
 * 
 * ```json
 * {
 *   "mcpServers": {
 *     "agentic-analyst": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "path/to/agentic-server.ts"]
 *     },
 *     "workflow-processor": {
 *       "command": "deno", 
 *       "args": ["run", "--allow-all", "path/to/workflow-server.ts"]
 *     }
 *   }
 * }
 * ```
 */
