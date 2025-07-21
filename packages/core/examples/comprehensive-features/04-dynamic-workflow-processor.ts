/**
 * MCPC Example 04: Dynamic Workflow Document Processor
 * 
 * Demonstrates agentic workflow mode with dynamic step generation.
 * The agent generates workflow steps at runtime based on the document
 * type and processing requirements.
 * 
 * Features:
 * - Dynamic workflow step generation
 * - Adaptive processing based on content type
 * - Flexible document handling
 * - Runtime workflow optimization
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../../mod.ts";

export const server = await mcpc(
  [
    {
      name: "dynamic-workflow-processor",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [
    {
      name: "document-processor",
      
      options: {
        mode: "agentic_workflow"
        // No predefined steps - will generate dynamically at runtime
      },
      
      description: `**Objective:** Process and analyze documents through a dynamically generated workflow that adapts to document type and processing requirements.

**Dynamic Workflow Generation:**
I analyze each document processing request and dynamically create an optimal workflow with these potential phases:

**Discovery Phase:**
- Document type identification (PDF, Word, Text, Markdown, CSV, JSON)
- Content structure analysis
- Metadata extraction
- File size and complexity assessment

**Analysis Phase:**
- Content parsing and extraction
- Language detection
- Keyword and entity identification
- Structure and formatting analysis
- Quality and completeness assessment

**Processing Phase:**
- Format conversion and standardization
- Content cleaning and normalization
- Data extraction and structuring
- Enhancement and enrichment
- Validation and quality checks

**Output Phase:**
- Processed document generation
- Summary and report creation
- Metadata and index generation
- Quality metrics and statistics

**Available Tools:**
<tool name="@wonderwhy-er/desktop-commander.list_directory"/>
<tool name="@wonderwhy-er/desktop-commander.read_file"/>
<tool name="@wonderwhy-er/desktop-commander.write_file"/>
<tool name="@wonderwhy-er/desktop-commander.create_directory"/>
<tool name="code-runner.python-code-runner"/>

**Adaptive Features:**
- Workflow steps tailored to specific document types
- Processing intensity based on content complexity
- Error recovery with alternative processing paths
- Batch processing optimization for multiple documents
- Custom output formats based on requirements

**Document Types Supported:**
- Text documents (TXT, MD, RTF)
- Structured data (CSV, JSON, XML, YAML)
- Code files (Python, JavaScript, TypeScript, etc.)
- Configuration files (INI, CONF, ENV)
- Log files and system outputs
- Research papers and articles
- Technical documentation

The exact workflow steps will be generated dynamically based on the specific documents and processing goals.`,
      
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
    },
  ]
);

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Key Features of Dynamic Workflow Mode:
 * 
 * 1. **Runtime Step Generation:**
 *    - Creates workflow steps based on context
 *    - Adapts to document type and complexity
 *    - Optimizes for specific processing goals
 * 
 * 2. **Intelligent Adaptation:**
 *    - Analyzes content before processing
 *    - Chooses appropriate tools and techniques
 *    - Adjusts workflow based on findings
 * 
 * 3. **Flexible Processing:**
 *    - Handles various document formats
 *    - Scales workflow based on file size
 *    - Supports custom processing requirements
 * 
 * 4. **Contextual Optimization:**
 *    - Minimizes unnecessary steps
 *    - Focuses on relevant processing tasks
 *    - Balances thoroughness with efficiency
 * 
 * Example Workflows:
 * 
 * For CSV files:
 * 1. Data structure analysis
 * 2. Statistical summary generation
 * 3. Data quality assessment
 * 4. Visualization creation
 * 5. Insights report generation
 * 
 * For PDF documents:
 * 1. Text extraction and OCR
 * 2. Structure identification
 * 3. Content categorization
 * 4. Summary generation
 * 5. Searchable format creation
 * 
 * For code files:
 * 1. Syntax analysis and validation
 * 2. Complexity metrics calculation
 * 3. Documentation extraction
 * 4. Code quality assessment
 * 5. Improvement recommendations
 * 
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "document-processor": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "04-dynamic-workflow-processor.ts"]
 *     }
 *   }
 * }
 * ```
 */
