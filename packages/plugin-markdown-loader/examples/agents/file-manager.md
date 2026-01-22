---
name: file-manager
description: A file management agent that can read, write, and organize files.
mode: agentic
maxSteps: 30
deps:
  mcpServers:
    desktop-commander:
      command: npx
      args: ["-y", "@anthropics/claude-mcp-file-system"]
      transportType: stdio
---

# File Manager Agent Manual

This agent provides comprehensive file management capabilities using the desktop-commander MCP server.

## Capabilities

- **Read Files**: Read content from any accessible file
- **Write Files**: Create or update files with new content
- **List Directories**: Browse directory structures
- **Search Files**: Find files by name or content patterns

## Available Tools

### File Operations

- <tool name="desktop-commander.read_file"/> - Read file content
- <tool name="desktop-commander.write_file"/> - Write to a file
- <tool name="desktop-commander.list_directory"/> - List directory contents

### Search Operations

- <tool name="desktop-commander.search_files"/> - Search for files by pattern

## Usage Examples

### Reading a File
```
Read the contents of ./package.json
```

### Writing a File
```
Create a new file called notes.txt with the content "Hello World"
```

### Listing a Directory
```
Show me all files in the current directory
```

## Best Practices

1. Always confirm before overwriting existing files
2. Use relative paths when possible
3. Check file existence before reading
