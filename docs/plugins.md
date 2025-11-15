# Plugin System Guide

Plugins extend and customize your MCPC servers by transforming how tools behave.
They're modular, composable, and easy to use.

## Quick Start

### Using Built-in Plugins

Add the large-result plugin to handle oversized outputs from mcp tool-calls:

```typescript
import { mcpc } from "@mcpc/core";
import { createLargeResultPlugin } from "@mcpc/core/plugins";

const server = await mcpc(
  [{ name: "my-agent", version: "1.0.0" }, { capabilities: { tools: {} } }],
  [{
    name: "my-agent",
    description: "Agent that handles large tool results",
    plugins: [
      createLargeResultPlugin({ maxSize: 8000 }),
    ],
  }],
);
```

### Loading from Files

Load plugins from file paths with optional parameters:

```typescript
plugins: [
  "./plugins/my-custom-plugin.ts",
  "./plugins/large-result.ts?maxSize=10000&previewSize=5000",
];
```

## Common Use Cases

### Handling Large Tool Results

When tools return too much data (>8KB), automatically save it and provide
search:

```typescript
import { createLargeResultPlugin } from "@mcpc/core/plugins";

plugins: [
  createLargeResultPlugin({
    maxSize: 8000, // Save results larger than this
    previewSize: 4000, // Show this much in preview
  }),
];
```

**What it does:**

1. Monitors tool result sizes
2. When too large: saves full content to temp file
3. Returns preview + file path
4. Adds `search-tool-result` tool to query saved files

**Example output:**

```
Result too large (45000 chars), saved to file

📁 File: /tmp/mcpc-results-xyz/tool-result.txt
📊 Size: 43.9 KB

Preview (4000 chars):
...preview content...

To read/understand the full content:
- Use search-tool-result {"pattern": "your-search-term"}
```

**Implementation**: The plugin wraps tool execution and automatically saves
oversized results. It dynamically adds the search plugin for querying saved
content. See
[`packages/core/src/plugins/large-result.ts`](../packages/core/src/plugins/large-result.ts)
for details.

### Adding Search Functionality

Add file search to any directory:

```typescript
import { createSearchPlugin } from "@mcpc/core/plugins";

plugins: [
  createSearchPlugin({
    allowedDir: "./workspace", // Where to search
    maxResults: 20, // Limit results
    timeoutMs: 30000, // Search timeout
  }),
];
```

Adds a `search-tool-result` tool that supports:

- Literal text search
- Regular expressions
- File path filtering
- Result size limiting

## Creating Plugins

### Basic Structure

A plugin is a simple object with a name and hooks:

```typescript
export const createMyPlugin = (options = {}) => ({
  name: "my-plugin",

  // Add tools or setup resources
  configureServer: async (server) => {
    server.tool("my-tool", "Description", schema, callback);
  },

  // Transform how tools work
  transformTool: (tool, context) => {
    const originalExecute = tool.execute;
    tool.execute = async (args) => {
      console.log(`Calling ${tool.name}`);
      return await originalExecute(args);
    };
    return tool;
  },

  // Cleanup when done
  dispose: () => {
    // Clear resources
  },
});

// Export both factory and default instance
export default createMyPlugin();
```

### File Structure

For parameterized plugins, export both:

```typescript
// my-plugin.ts
export function createPlugin(options = {}) {
  return {
    name: "my-plugin",
    // ... plugin implementation
  };
}

export default createPlugin(); // Default with no params
```

This allows usage as:

- `"./my-plugin.ts"` - uses default
- `"./my-plugin.ts?param=value"` - uses factory with params

### Lifecycle Hooks

Hooks execute in this order:

```typescript
{
  // 1. Called when plugin added to server
  configureServer: async (server) => {
    // Setup: add tools, initialize resources
  },
  
  // 2. Called before tool composition
  composeStart: async (context) => {
    // Validate configuration, prepare for composition
  },
  
  // 3. Called for each tool during composition
  transformTool: (tool, context) => {
    // Modify tool behavior
    return tool;
  },
  
  // 4. Called after all tools composed
  finalizeComposition: async (tools, context) => {
    // Post-processing, validation
  },
  
  // 5. Called when composition complete
  composeEnd: async (context) => {
    // Logging, metrics
  },
  
  // 6. Called when server closes
  dispose: () => {
    // Cleanup: close connections, clear timers
  },
}
```

### Useful Context

Access helpful information in hooks:

```typescript
transformTool: ((tool, context) => {
  console.log(context.toolName); // Current tool name
  console.log(context.mode); // "agentic" | "agentic_workflow"
  console.log(context.originalTool); // Tool before any transforms
  console.log(context.transformationIndex); // How many transforms applied
  // context.server - Full server instance
});

composeEnd: (async (context) => {
  console.log(context.stats.totalTools); // Total tool count
  console.log(context.stats.publicTools); // Public tools (exposed to MCP clients)
  console.log(context.stats.hiddenTools); // Hidden tools (not visible in agent context)
  console.log(context.pluginNames); // All loaded plugins
});
```

## Common Patterns

### Wrapping Tool Execution

Add timing to all tools:

```typescript
const timingPlugin = {
  name: "timing",
  transformTool: (tool, context) => {
    const original = tool.execute;
    tool.execute = async (args) => {
      const start = Date.now();
      const result = await original(args);
      console.log(`${context.toolName}: ${Date.now() - start}ms`);
      return result;
    };
    return tool;
  },
};
```

### Adding Custom Tools

Register new tools from plugins:

```typescript
import { jsonSchema } from "ai";

const customToolPlugin = {
  name: "add-calculator",
  configureServer: (server) => {
    server.tool(
      "calculate",
      "Perform calculations",
      jsonSchema<{ expression: string }>({
        type: "object",
        properties: {
          expression: { type: "string", description: "Math expression" },
        },
        required: ["expression"],
      }),
      async (args) => {
        const result = eval(args.expression); // Don't actually use eval!
        return { content: [{ type: "text", text: `Result: ${result}` }] };
      },
    );
  },
};
```

### Conditional Application

Apply plugins only in specific modes:

```typescript
{
  name: "workflow-only",
  apply: "workflow",  // Only in workflow mode
  transformTool: (tool) => { /* ... */ },
}

// Or use a function
{
  name: "conditional",
  apply: (mode) => mode === "agentic" && someCondition(),
  transformTool: (tool) => { /* ... */ },
}
```

### Plugin Dependencies

Ensure plugins load in order:

```typescript
{
  name: "my-plugin",
  dependencies: ["plugin-search"],  // Load after search plugin
  configureServer: (server) => {
    // Can safely use search plugin features
  },
}
```

### Execution Order

Control when your plugin runs:

```typescript
{
  name: "early-plugin",
  enforce: "pre",  // Run before other plugins
  transformTool: (tool) => { /* ... */ },
}

{
  name: "late-plugin",
  enforce: "post",  // Run after other plugins
  transformTool: (tool) => { /* ... */ },
}
```

Order: `pre` plugins → regular plugins → `post` plugins

## Advanced Examples

### Error Handling Wrapper

Catch and log errors from any tool:

```typescript
const errorHandlerPlugin = {
  name: "error-handler",
  transformTool: (tool, context) => {
    const original = tool.execute;
    tool.execute = async (args) => {
      try {
        return await original(args);
      } catch (error) {
        console.error(`Error in ${context.toolName}:`, error);
        return {
          content: [{
            type: "text",
            text: `Tool failed: ${error.message}`,
          }],
          isError: true,
        };
      }
    };
    return tool;
  },
};
```

### Result Caching

Cache tool results:

```typescript
const cachingPlugin = {
  name: "cache",

  configureServer() {
    this.cache = new Map();
  },

  transformTool: (tool, context) => {
    const original = tool.execute;
    tool.execute = async (args) => {
      const key = JSON.stringify({ tool: context.toolName, args });

      if (this.cache.has(key)) {
        console.log(`Cache hit: ${context.toolName}`);
        return this.cache.get(key);
      }

      const result = await original(args);
      this.cache.set(key, result);
      return result;
    };
    return tool;
  },

  dispose() {
    this.cache.clear();
  },
};
```

### Rate Limiting

Add rate limits to external API tools:

```typescript
const rateLimitPlugin = {
  name: "rate-limit",

  configureServer() {
    this.lastCall = new Map();
    this.minInterval = 1000; // 1 second between calls
  },

  transformTool: (tool, context) => {
    const original = tool.execute;
    tool.execute = async (args) => {
      const lastTime = this.lastCall.get(context.toolName) || 0;
      const elapsed = Date.now() - lastTime;

      if (elapsed < this.minInterval) {
        await new Promise((r) => setTimeout(r, this.minInterval - elapsed));
      }

      this.lastCall.set(context.toolName, Date.now());
      return await original(args);
    };
    return tool;
  },

  dispose() {
    this.lastCall.clear();
  },
};
```

## Parameter Parsing

Query parameters are automatically typed:

```typescript
// URL: "./plugin.ts?size=1000&enabled=true&tags=a,b,c"
// Parsed to: { size: 1000, enabled: true, tags: ["a", "b", "c"] }

export function createPlugin(options) {
  console.log(typeof options.size); // "number"
  console.log(typeof options.enabled); // "boolean"
  console.log(Array.isArray(options.tags)); // true
}
```

**Type conversions:**

- Numbers: `size=1000` → `1000`
- Booleans: `enabled=true` → `true` / `false`
- Arrays: `tags=a,b,c` → `["a", "b", "c"]`
- Strings: `name=test` → `"test"`

## Best Practices

✅ **DO:**

- Give plugins descriptive, unique names
- Always return the tool from `transformTool`
- Clean up resources in `dispose()`
- Handle errors gracefully
- Document your plugin options

```typescript
// ✅ Good
export function createMyPlugin(options = {}) {
  return {
    name: "my-plugin",
    transformTool: (tool) => {
      // Transform tool
      return tool; // Always return!
    },
    dispose: () => {
      // Clean up
    },
  };
}
```

❌ **DON'T:**

- Forget to return tools from `transformTool`
- Create circular dependencies
- Leave timers/connections open
- Block the event loop in hooks
- Modify global state

```typescript
// ❌ Bad
transformTool: ((tool) => {
  tool.execute = newFunc;
  // Missing return!
});
```

## Troubleshooting

### Plugin Not Loading

**Problem:** Plugin doesn't load from file path

**Solution:** Ensure proper exports:

```typescript
// ✅ Correct
export function createPlugin(options) {/* ... */}
export default createPlugin();

// ❌ Missing default export
export function createPlugin(options) {/* ... */}
```

### Tool Transformations Ignored

**Problem:** Changes to tool don't apply

**Solution:** Return the modified tool:

```typescript
// ✅ Correct
transformTool: ((tool) => {
  tool.execute = newFunc;
  return tool;
});
```

### Dependency Error

**Problem:** "Missing dependency" error

**Solution:** Load dependencies first or declare them:

```typescript
plugins: [
  "./plugin-search.ts",    // Load first
  "./my-plugin.ts",        // Uses search
]

// Or declare dependency
{
  name: "my-plugin",
  dependencies: ["plugin-search"],
  // ...
}
```

### Parameter Not Working

**Problem:** Plugin parameters not parsed

**Solution:** Use query string syntax:

```typescript
// ✅ Correct
"./plugin.ts?maxSize=8000&enabled=true";

// ❌ Won't work
"./plugin.ts?{maxSize:8000}";
```

## Available Plugins

### Built-in (Auto-loaded)

These plugins are automatically included:

- **tool-name-mapping** - Allows `server.tool` and `server_tool` syntax
- **config** - Applies tool configuration overrides
- **logging** - Logs composition information

### Mode Plugins (Auto-loaded)

Execution mode plugins activate automatically based on your `mode` option:

- **mode-agentic** - Interactive step-by-step execution (default)
- **mode-agentic-workflow** - Structured workflow with steps
- **mode-agentic-sampling** - Autonomous execution with internal LLM
- **mode-agentic-workflow-sampling** - Autonomous workflow execution
- **mode-code-execution** - Secure JavaScript sandbox (requires separate
  package)

Each mode plugin registers the appropriate tool and connects it to its executor
implementation in `packages/core/src/executors/`.

> 📖 **Learn More**: See [Execution Modes Guide](./execution-modes.md) for
> detailed documentation on each mode.

### User Plugins

Import from `@mcpc/core/plugins`:

```typescript
import {
  createLargeResultPlugin,
  createSearchPlugin,
} from "@mcpc/core/plugins";
```

**Large Result Plugin:**

- Saves oversized results to files
- Provides search functionality
- Shows previews with file paths

**Search Plugin:**

- Adds `search-tool-result` tool
- Supports regex patterns
- Configurable timeout and result limits

## Examples

See working examples in `packages/core/examples/`:

- `11-large-result-plugin-agentic.ts` - Large result handling
- `12-large-result-plugin-workflow.ts` - Large results in workflows

## API Reference

### Plugin Interface

```typescript
interface ToolPlugin {
  name: string;
  version?: string;
  enforce?: "pre" | "post";
  apply?: "agentic" | "workflow" | ((mode: string) => boolean);
  dependencies?: string[];

  configureServer?: (server: ComposableMCPServer) => void | Promise<void>;
  composeStart?: (context: ComposeStartContext) => void | Promise<void>;
  transformTool?: (
    tool: ComposedTool,
    context: TransformContext,
  ) => ComposedTool | void | Promise<ComposedTool | void>;
  finalizeComposition?: (
    tools: Record<string, ComposedTool>,
    context: FinalizeContext,
  ) => void | Promise<void>;
  composeEnd?: (context: ComposeEndContext) => void | Promise<void>;
  dispose?: () => void | Promise<void>;
}
```

### Utility Functions

From `@mcpc/core/plugin-utils`:

```typescript
// Validate plugins before use
import { validatePlugins } from "@mcpc/core/plugin-utils";
const result = validatePlugins(plugins);
if (!result.valid) {
  console.error(result.errors);
}

// Clear plugin cache (useful in development)
import { clearPluginCache } from "@mcpc/core/plugin-utils";
clearPluginCache();
```

## Next Steps

- Check out the [examples](../packages/core/examples/)
- Read about [tool composition](./learn-more/agentic-mcp-tools.md)
- Explore [logging and tracing](./logging-and-tracing.md)
