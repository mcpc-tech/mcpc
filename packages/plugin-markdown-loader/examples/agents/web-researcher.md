---
name: web-researcher
description: Research agent that can fetch and analyze web content.
mode: agentic
maxSteps: 50
deps:
  mcpServers:
    fetch:
      command: npx
      args: ["-y", "@anthropics/mcp-fetch"]
      transportType: stdio
---

# Web Researcher Agent Manual

This agent specializes in web research tasks, fetching and analyzing content from URLs.

## Capabilities

- Fetch web pages and extract content
- Convert HTML to readable markdown
- Analyze and summarize web content

## Available Tools

- <tool name="fetch.fetch"/> - Fetch content from a URL

## Usage Examples

### Fetch a Web Page
```
Fetch the content from https://example.com and summarize it
```

### Research a Topic
```
Research the latest news about TypeScript 5.0 features
```

## Notes

- Respects robots.txt and rate limits
- Works best with text-heavy pages
- May not work with JavaScript-rendered content
