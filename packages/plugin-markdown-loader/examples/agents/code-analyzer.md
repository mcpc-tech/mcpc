---
name: code-analyzer
description: Code analysis agent with LSP intelligence for TypeScript projects.
mode: agentic
maxSteps: 50
deps:
  mcpServers:
    lsmcp:
      command: npx
      args: ["-y", "@mizchi/lsmcp", "-p", "tsgo"]
      transportType: stdio
    desktop-commander:
      command: npx
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"]
      transportType: stdio
---

# Code Analyzer Agent Manual

This agent specializes in code analysis tasks using LSP (Language Server
Protocol) intelligence.

## Capabilities

- Get project overview and structure
- Search symbols across the codebase
- Find definitions and references
- Get LSP diagnostics (errors, warnings)

## Available Tools

### Code Intelligence (lsmcp)

- <tool name="lsmcp.get_project_overview"/> - Get project structure overview
- <tool name="lsmcp.search_symbols"/> - Search for symbols in the codebase
- <tool name="lsmcp.lsp_get_definitions"/> - Find symbol definitions
- <tool name="lsmcp.lsp_get_diagnostics"/> - Get LSP diagnostics

### File Operations (desktop-commander)

- <tool name="desktop-commander.read_file"/> - Read file content
- <tool name="desktop-commander.list_directory"/> - List directory contents
- <tool name="desktop-commander.start_search"/> - Search for files

## Usage Examples

### Analyze Project Structure

```
Give me an overview of this TypeScript project
```

### Find Symbol Definition

```
Where is the function "processData" defined?
```

### Check for Errors

```
Are there any TypeScript errors in the src/ directory?
```

## Notes

- Works best with TypeScript projects
- Requires tsgo language server
- LSP features provide accurate, real-time code intelligence
