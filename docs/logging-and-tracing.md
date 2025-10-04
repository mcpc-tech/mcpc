# MCP Logging and OpenTelemetry Tracing

This document describes the logging and tracing capabilities in MCPC.

## MCP Logging

MCPC implements the
[Model Context Protocol (MCP) logging specification](https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/logging).

### Features

- **Always Visible**: Logs output to console for immediate visibility
- **MCP Protocol**: Logs sent via `server.sendLoggingMessage()` for client
  consumption
- **Dynamic Level Control**: Clients can adjust log levels via
  `logging/setLevel` requests
- **Structured Logging**: Supports both string messages and objects
- **Hierarchical Loggers**: Create child loggers with namespaced names

### Log Levels

From lowest to highest priority:

- debug (0)
- info (1)
- notice (2)
- warning (3)
- error (4)
- critical (5)
- alert (6)
- emergency (7)

### Usage

```typescript
import { createLogger } from "./packages/core/src/utils/logger.ts";

const logger = createLogger("my-component", server);

// Simple messages
await logger.info("Application started");
await logger.warning("Resource usage high");
await logger.error("Operation failed");

// Structured data
await logger.debug({
  operation: "tool_call",
  tool: "read_file",
  duration: 150,
});

// Child loggers
const childLogger = logger.child("subcomponent");
await childLogger.info("Message"); // Logs as "my-component.subcomponent"

// Level control
logger.setLevel("warning"); // Only warning and higher
const currentLevel = logger.getLevel();
```

### Where It's Used

- **compose.ts**: Server lifecycle events, tool matching warnings
- **base-sampling-executor.ts**: Iteration progress, summarization failures
- **logging-plugin.ts**: Composition completion details

## OpenTelemetry Tracing

MCPC uses OpenTelemetry for distributed tracing in sampling workflows.

### Configuration

Enable via environment variables:

```bash
export MCPC_TRACING_ENABLED=true
export MCPC_TRACING_EXPORT=console  # console, otlp, or none
export MCPC_TRACING_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

### Implementation

Tracing is automatically initialized in `BaseSamplingExecutor`:

```typescript
import process from "node:process";

constructor(...) {
  const tracingConfig = {
    enabled: process.env.MCPC_TRACING_ENABLED === "true",
    serviceName: `mcpc-sampling-${name}`,
    exportTo: process.env.MCPC_TRACING_EXPORT ?? "otlp",
    otlpEndpoint: process.env.MCPC_TRACING_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  };
  
  if (tracingConfig.enabled) {
    initializeTracing(tracingConfig);
  }
}
```

### Trace Structure

```
mcpc.sampling_loop (root)
├─ mcpc.sampling_iteration.lsmcp_get_project_overview
│  └─ attributes: iteration, isError, isComplete, parsed, samplingResponse
├─ mcpc.sampling_iteration.desktop-commander_read_file
└─ mcpc.sampling_iteration.complete
```

### Manual Tracing

```typescript
import { endSpan, startSpan, withSpan } from "./utils/tracing.ts";

// Async wrapper
const result = await withSpan("operation", { key: "value" }, async (span) => {
  span.addEvent("checkpoint", { progress: 50 });
  return result;
});

// Manual control
const span = startSpan("custom_operation", { tool: "my-tool" });
try {
  // Do work
  endSpan(span);
} catch (error) {
  endSpan(span, error);
  throw error;
}
```

### Integration

Export traces to:

- **Jaeger**: `http://localhost:4318/v1/traces`
- **Grafana Tempo**: Via OTLP
- **Cloud Providers**: AWS X-Ray, Google Cloud Trace, Azure Monitor

## Best Practices

### Logging

**Use appropriate levels:**

```typescript
// Debug: Detailed diagnostics
await logger.debug({ parsedData, iteration: 5 });

// Info: General information
await logger.info("Server started on port 3000");

// Warning: Non-critical issues
await logger.warning("Cache miss, fetching from remote");

// Error: Issues requiring attention
await logger.error({ error: err.message, operation: "fetch" });
```

**Structured over strings:**

```typescript
// Good
await logger.info({
  operation: "tool_call",
  tool: "read_file",
  duration: 150,
  success: true,
});

// Also good for simple messages
await logger.info("Operation completed");
```

### Tracing

**Development:**

```bash
export MCPC_TRACING_ENABLED=true
export MCPC_TRACING_EXPORT=console
```

**Production:**

```bash
export MCPC_TRACING_ENABLED=true
export MCPC_TRACING_EXPORT=otlp
export MCPC_TRACING_OTLP_ENDPOINT=http://your-collector:4318/v1/traces
```

**Performance:**

- Disable tracing for latency-sensitive workloads
- Use `none` export mode to collect metrics without sending

## Examples

See `packages/core/examples/sampling/` for working demonstrations.

## References

- [MCP Logging Specification](https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/logging)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OpenTelemetry JavaScript](https://github.com/open-telemetry/opentelemetry-js)
