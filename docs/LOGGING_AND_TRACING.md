# MCP Logging and OpenTelemetry Tracing

This document describes the logging and tracing capabilities implemented in
MCPC.

## MCP Logging

MCPC now implements the Model Context Protocol (MCP) logging specification for
structured logging that can be consumed by MCP clients.

### Features

- **Always Visible**: Logs are always output to console for visibility
- **MCP Notifications**: Logs are also sent as MCP `notifications/message`
  events when a server is available
- **Log Levels**: Supports all MCP log levels: debug, info, notice, warning,
  error, critical, alert, emergency
- **Structured Logging**: Supports both string messages and structured objects
- **Hierarchical Loggers**: Create child loggers with namespaced names

### Usage

#### Basic Logging

```typescript
import { createLogger } from "./packages/core/src/utils/logger.ts";

// Create a logger
const logger = createLogger("my-component", server);

// Log at different levels
await logger.info("Application started");
await logger.warning("Resource usage high");
await logger.error("Operation failed");
await logger.debug({ data: "value" }); // Structured logging
```

#### In Server Components

The `ComposableMCPServer` automatically creates a logger and sets it up to use
MCP notifications:

```typescript
// In compose.ts
private logger = createLogger("mcpc.compose");

constructor(_serverInfo: Implementation, options: ServerOptions) {
  super(_serverInfo, options);
  this.logger.setServer(this); // Enable MCP notifications
}
```

### Where It's Used

1. **compose.ts**: Logs server lifecycle events (closed, errors), tool matching
   warnings
2. **base-sampling-executor.ts**: Logs iteration progress during sampling
   workflows
3. **logging-plugin.ts**: Logs composition completion details

## OpenTelemetry Tracing

MCPC implements distributed tracing for sampling workflows using OpenTelemetry
(OTEL).

### Features

- **Automatic Span Creation**: Creates spans for sampling loops and iterations
- **Error Tracking**: Captures exceptions and error states in spans
- **Flexible Export**: Export traces to console, OTLP endpoint, or disable
  entirely
- **Context Propagation**: Maintains trace context across async operations

### Configuration

Enable tracing via environment variables:

```bash
# Enable tracing
export MCPC_TRACING_ENABLED=true

# Configure export destination (console, otlp, or none)
export MCPC_TRACING_EXPORT=console

# For OTLP export, specify endpoint
export MCPC_TRACING_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

### Usage

#### In Sampling Executors

Tracing is automatically enabled in `BaseSamplingExecutor`:

```typescript
// Constructor initializes tracing
constructor(...) {
  const tracingConfig = {
    enabled: Deno.env.get("MCPC_TRACING_ENABLED") === "true",
    serviceName: `mcpc-sampling-${name}`,
    exportTo: Deno.env.get("MCPC_TRACING_EXPORT") || "console",
  };
  if (tracingConfig.enabled) {
    initializeTracing(tracingConfig);
  }
}

// Sampling loop creates spans automatically
protected async runSamplingLoop(...) {
  const loopSpan = startSpan("sampling_loop", { agent: this.name });
  
  for (each iteration) {
    const iterationSpan = startSpan("sampling_iteration", { 
      iteration: this.currentIteration 
    });
    // ... work ...
    endSpan(iterationSpan);
  }
  
  endSpan(loopSpan);
}
```

#### Manual Span Creation

For custom tracing needs:

```typescript
import {
  endSpan,
  startSpan,
  withSpan,
} from "./packages/core/src/utils/tracing.ts";

// Async function wrapper
const result = await withSpan(
  "operation_name",
  { key: "value" },
  async (span) => {
    // Do work
    span.addEvent("checkpoint", { progress: 50 });
    return result;
  },
);

// Manual control
const span = startSpan("custom_operation", { tool: "my-tool" });
try {
  // Do work
  endSpan(span); // Marks as successful
} catch (error) {
  endSpan(span, error); // Marks as error
  throw error;
}
```

### Trace Structure

The sampling workflow creates the following trace hierarchy:

```
sampling_loop (root)
├─ sampling_iteration (iteration 1)
│  ├─ parse_error (event, if applicable)
│  └─ attributes: iteration, isError, isComplete
├─ sampling_iteration (iteration 2)
│  └─ ...
└─ sampling_iteration (iteration N)
```

### Integration with Observability Platforms

OTLP traces can be sent to:

- **Jaeger**: Set endpoint to `http://localhost:4318/v1/traces`
- **Zipkin**: Compatible via OTLP collector
- **Grafana Tempo**: Via OTLP
- **Cloud Providers**: AWS X-Ray, Google Cloud Trace, Azure Monitor (via OTLP
  collector)

## Best Practices

1. **Use Appropriate Log Levels**
   - `debug`: Detailed diagnostic information
   - `info`: General informational messages
   - `warning`: Warning messages, non-critical issues
   - `error`: Error conditions that need attention

2. **Structured Logging**
   ```typescript
   // Good: Structured data
   await logger.info({
     operation: "tool_call",
     tool: "read_file",
     duration: 150,
   });

   // Also good: Simple messages
   await logger.info("Operation completed successfully");
   ```

3. **Enable Tracing for Debugging**
   - Use console export during development
   - Use OTLP export in production for centralized monitoring
   - Disable tracing in performance-critical scenarios

4. **Child Loggers**
   ```typescript
   const componentLogger = logger.child("subcomponent");
   await componentLogger.info("Message"); // Logs as "parent.subcomponent"
   ```

## Examples

See the sampling examples in `packages/core/examples/sampling/` for working
demonstrations of logging and tracing in action.

## References

- [MCP Logging Specification](https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/logging)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OpenTelemetry JavaScript](https://github.com/open-telemetry/opentelemetry-js)
