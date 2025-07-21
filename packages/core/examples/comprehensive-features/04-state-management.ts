/**
 * MCPC Feature Example 04: State Management and Workflow Control
 * 
 * This example demonstrates advanced state management in MCPC workflows:
 * - Workflow state tracking and persistence
 * - Step progression and navigation
 * - Conditional workflow execution
 * - Error handling and recovery
 * - State debugging and inspection
 * 
 * Features a document processing workflow with state management.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc, type ComposeDefination } from "../../mod.ts";

const documentProcessorWithState: ComposeDefination = {
  name: "document-processor-stateful",
  
  options: {
    mode: "agentic_workflow",
    steps: [
      {
        description: "Initialize document processing session and analyze the document type and structure.",
        actions: ["reasoning"]
      },
      {
        description: "Scan the target directory to discover available documents for processing.",
        actions: ["@wonderwhy-er/desktop-commander.list_directory"]
      },
      {
        description: "Read and analyze the document content, extracting key information and metadata.",
        actions: ["@wonderwhy-er/desktop-commander.read_file"]
      },
      {
        description: "Process the document content using Python for text analysis, data extraction, or format conversion.",
        actions: ["code-runner.python-code-runner"]
      },
      {
        description: "Generate processed output and save results to appropriate output files.",
        actions: ["@wonderwhy-er/desktop-commander.write_file"]
      },
      {
        description: "Create a processing summary report with statistics and quality metrics.",
        actions: ["code-runner.python-code-runner", "@wonderwhy-er/desktop-commander.write_file"]
      },
      {
        description: "Validate the processing results and perform quality checks on the output.",
        actions: ["@wonderwhy-er/desktop-commander.read_file", "reasoning"]
      },
      {
        description: "Finalize the processing session and clean up temporary resources if needed.",
        actions: ["reasoning"]
      }
    ]
  },
  
  description: `**Objective:** Process documents through a comprehensive, stateful workflow with full state tracking.

**State Management Features:**
- Track current workflow step and completion status
- Maintain processing context between steps
- Handle errors with automatic recovery options
- Provide workflow navigation and debugging capabilities
- Support conditional step execution based on document type

**Processing Capabilities:**
- Multi-format document support (PDF, Word, Text, Markdown)
- Content extraction and transformation
- Metadata analysis and enhancement
- Quality validation and reporting
- Batch processing with progress tracking

**Workflow Control:**
- Step-by-step execution with state persistence
- Ability to pause, resume, and restart workflows
- Dynamic step modification based on processing results
- Error recovery with rollback capabilities

**Output:**
- Processed documents in specified formats
- Comprehensive processing reports
- Quality metrics and validation results
- Complete audit trail of processing steps`,
  
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

export const server = await mcpc(
  [
    {
      name: "document-processor-stateful",
      version: "1.0.0",
    },
    { capabilities: { tools: { listChanged: true } } },
  ],
  [documentProcessorWithState]
);

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * Key State Management Features Demonstrated:
 * 
 * 1. **Workflow Step Tracking:**
 *    - Each step has a defined purpose and expected actions
 *    - System tracks current step index and completion status
 *    - Supports forward and backward navigation through steps
 * 
 * 2. **State Persistence:**
 *    - Workflow state is maintained across tool calls
 *    - Processing context preserved between steps
 *    - Automatic state validation and consistency checks
 * 
 * 3. **Error Handling:**
 *    - Graceful error recovery with context preservation
 *    - Automatic retry mechanisms for transient failures
 *    - Rollback capabilities for failed operations
 * 
 * 4. **Conditional Execution:**
 *    - Steps can be skipped based on conditions
 *    - Dynamic workflow modification during execution
 *    - Branch execution based on document type or content
 * 
 * 5. **Debugging and Monitoring:**
 *    - Real-time workflow state inspection
 *    - Step execution logging and timing
 *    - Progress reporting and status updates
 * 
 * Usage Examples:
 * 
 * ```
 * User: "Process the PDF files in /documents folder"
 * Agent: [Step 1] Initializing document processing...
 *         [Step 2] Scanning /documents folder...
 *         [Step 3] Reading document1.pdf...
 *         [Step 4] Processing content with Python...
 *         [Step 5] Saving processed output...
 *         [Step 6] Generating summary report...
 *         [Step 7] Validating results...
 *         [Step 8] Finalizing processing session...
 * ```
 * 
 * Claude Desktop Configuration:
 * ```json
 * {
 *   "mcpServers": {
 *     "document-processor": {
 *       "command": "deno",
 *       "args": ["run", "--allow-all", "04-state-management.ts"]
 *     }
 *   }
 * }
 * ```
 */
