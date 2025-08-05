# MCPC Comprehensive Feature Examples

This directory contains examples demonstrating all the features and capabilities
of MCPC (Model Context Protocol Composer). Each example is a complete, runnable
server showcasing specific MCPC features.

## Examples Overview

### Core Features

- **01-basic-file-manager.ts** - Simple MCP composition with file operations
- **02-agentic-data-analyst.ts** - Fully autonomous agentic mode
- **03-workflow-image-generator.ts** - Structured workflow with predefined steps
- **04-dynamic-workflow-processor.ts** - Dynamic step generation at runtime

### Advanced Features

- **05-tool-override-manager.ts** - Tool customization, hidden tools, and
  security
- **06-multi-mcp-web-analyzer.ts** - Integration of multiple MCP servers
- **07-sse-transport-server.ts** - Server-Sent Events real-time transport
- **08-thinking-middleware-agent.ts** - AI reasoning and thinking middleware

Each example is complete and runnable, showcasing specific MCPC capabilities in
focused, practical scenarios.

## Quick Start

Each example is a complete, standalone server. Run any example directly:

```bash
# Run a specific example
deno run --allow-all examples/comprehensive-features/01-basic-file-manager.ts

# Or with Node.js
npm install && node examples/comprehensive-features/01-basic-file-manager.js
```

## Example Structure

Each example demonstrates:

- **Single focused feature** - One server, one primary capability
- **Complete implementation** - Ready to run without modifications
- **Detailed documentation** - Comments explaining concepts and usage
- **Real-world scenarios** - Practical applications and use cases
- **Configuration examples** - Claude Desktop integration guides

## Feature Coverage

**🔧 Core Composition**

- Basic MCP server creation and dependency management
- Tool selection and filtering with `<tool>` tags
- Simple vs complex workflow orchestration

**⚡ Execution Modes**

- **Agentic Mode:** Complete autonomy and self-orchestration
- **Workflow Mode:** Structured step-by-step execution
- **Dynamic Workflows:** Runtime step generation
- **Predefined Workflows:** Fixed step sequences

**🛠️ Tool Management**

- Tool description overrides and customization
- Hidden tools for internal operations
- Wildcard tool selection (`__ALL__`)
- Internal tool invocation and security

**🔄 Advanced Features**

- Multi-MCP server integration
- Real-time SSE transport
- Thinking middleware for transparent reasoning
- State management and persistence

**🌐 Integration**

- Browser automation and web scraping
- Code execution and data processing
- File system operations and management
- Real-time monitoring and streaming

## Integration with Claude Desktop

Add any example to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "file-manager": {
      "command": "deno",
      "args": ["run", "--allow-all", "path/to/01-basic-file-manager.ts"]
    },
    "data-analyst": {
      "command": "deno",
      "args": ["run", "--allow-all", "path/to/02-agentic-data-analyst.ts"]
    }
  }
}
```

## Example Structure

Each example includes:

- Complete working code
- Detailed comments explaining concepts
- Configuration examples
- Usage scenarios
- Best practices

## Dependencies

Most examples use these common MCP servers for demonstration:

- `@wonderwhy-er/desktop-commander` - File system operations
- `@mcpc/code-runner-mcp` - Code execution
- `@microsoft/playwright-mcp` - Browser automation
- `amap-maps` - Geographic services

Ensure you have the necessary API keys and permissions when running examples
that require external services.
