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
 * - Internal tools for document validation
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mcpc } from "../../mod.ts";
import { jsonSchema } from "ai";

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
        mode: "agentic_workflow",
        // No predefined steps - will generate dynamically at runtime
      },

      description:
        `**Objective:** Process and analyze documents through a dynamically generated workflow that adapts to document type and processing requirements.

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

**Internal Tools:**
I have access to internal document validation tools that help ensure processing quality and security.

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
  ],
  (server) => {
    // Register internal tool for document validation
    server.tool(
      "validate_document_format",
      "Internal tool to validate document format and processing compatibility",
      jsonSchema<{
        file_path: string;
        expected_format?: string;
      }>({
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the document file",
          },
          expected_format: {
            type: "string",
            description: "Expected document format (txt, md, json, csv, etc.)",
          },
        },
        required: ["file_path"],
      }),
      (args) => {
        const { file_path, expected_format } = args;

        try {
          // Extract file extension
          const extension = file_path.split(".").pop()?.toLowerCase();
          const supportedFormats = [
            "txt",
            "md",
            "json",
            "csv",
            "xml",
            "yaml",
            "yml",
            "py",
            "js",
            "ts",
          ];

          const isSupported = supportedFormats.includes(extension || "");
          const formatMatch = expected_format
            ? extension === expected_format.toLowerCase()
            : true;

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    file_path,
                    detected_format: extension,
                    expected_format,
                    is_supported: isSupported,
                    format_matches: formatMatch,
                    supported_formats: supportedFormats,
                    validation_result: isSupported && formatMatch
                      ? "VALID"
                      : "INVALID",
                    recommendations: !isSupported
                      ? `Format '${extension}' is not supported. Supported formats: ${
                        supportedFormats.join(
                          ", ",
                        )
                      }`
                      : !formatMatch
                      ? `Format mismatch: expected '${expected_format}', got '${extension}'`
                      : "Document format is valid for processing",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    error: "Failed to validate document format",
                    details: error instanceof Error
                      ? error.message
                      : "Unknown error",
                    file_path,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      },
      true, // This makes it an internal tool
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
