# Plugin Lifecycle Guide

This document describes the complete lifecycle of MCPC plugins, from server
initialization to tool execution.

## Overview

MCPC plugins have two main lifecycle phases:

1. **Composition Phase** - Server setup and tool registration
2. **Runtime Phase** - Tool execution with input/output transformation

## Lifecycle Diagram

```mermaid
flowchart TB
    subgraph Composition["Composition Phase"]
        direction TB
        A[Plugin Added] -->|addPlugin| B[configureServer]
        B --> C[compose called]
        C --> D[composeStart]
        D --> E[transformTool]
        E -->|for each tool| E
        E --> F[finalizeComposition]
        F --> G[registerAgentTool]
        G --> H[composeEnd]
    end
    
    subgraph Runtime["Runtime Phase - Tool Execution"]
        direction TB
        I[callTool] --> J[beforeToolExecute]
        J -->|skipExecution?| K{Skip?}
        K -->|Yes| L[Use provided result]
        K -->|No| M[transformInput]
        M --> N[Execute Tool]
        N --> O[transformOutput]
        O --> P[afterToolExecute]
        L --> P
        P --> Q[Return Result]
    end
    
    subgraph Cleanup["Cleanup Phase"]
        R[Server Close] --> S[dispose]
    end
    
    Composition --> Runtime
    Runtime --> Cleanup
```

## Composition Phase Hooks

These hooks are called during server setup and tool composition.

```mermaid
sequenceDiagram
    participant U as User
    participant S as Server
    participant PM as PluginManager
    participant P as Plugin
    
    U->>S: mcpc(config, agents)
    S->>PM: addPlugin(plugin)
    PM->>P: configureServer(server)
    Note over P: Add tools, setup resources
    
    U->>S: compose()
    S->>PM: triggerComposeStart()
    PM->>P: composeStart(context)
    Note over P: Validate config
    
    loop For each tool
        S->>PM: applyTransformToolHooks()
        PM->>P: transformTool(tool, context)
        Note over P: Modify tool behavior
    end
    
    S->>PM: triggerFinalizeComposition()
    PM->>P: finalizeComposition(tools, context)
    Note over P: Post-processing
    
    S->>PM: triggerRegisterAgentTool()
    PM->>P: registerAgentTool(context)
    Note over P: Register execution mode
    
    S->>PM: triggerComposeEnd()
    PM->>P: composeEnd(context)
    Note over P: Logging, metrics
```

### Hook Details

| Hook                  | When Called                       | Purpose                                         |
| --------------------- | --------------------------------- | ----------------------------------------------- |
| `configureServer`     | Plugin added to server            | Initial setup: add tools, initialize resources  |
| `composeStart`        | Before composition begins         | Validate configuration, prepare for composition |
| `transformTool`       | For each tool during composition  | Modify tool behavior, wrap execute function     |
| `finalizeComposition` | After all tools composed          | Post-processing, validation                     |
| `registerAgentTool`   | After finalize, before composeEnd | Register custom execution modes                 |
| `composeEnd`          | Composition complete              | Logging, metrics, final cleanup                 |

## Runtime Phase Hooks

These hooks are called during tool execution.

```mermaid
sequenceDiagram
    participant C as Caller
    participant S as Server
    participant PM as PluginManager
    participant P as Plugin
    participant T as Tool
    
    C->>S: callTool(name, args)
    S->>PM: triggerBeforeToolExecute(context)
    PM->>P: beforeToolExecute(context)
    Note over P: Can skip execution or modify args
    
    alt skipExecution = true
        P-->>PM: {skipExecution: true, result: ...}
        PM-->>S: Skipped result
    else Continue execution
        S->>PM: applyPluginTransforms(input)
        PM->>P: transformInput(args, context)
        Note over P: Transform input args
        
        S->>T: execute(transformedArgs)
        T-->>S: result
        
        S->>PM: applyPluginTransforms(output)
        PM->>P: transformOutput(result, context)
        Note over P: Transform output result
    end
    
    S->>PM: triggerAfterToolExecute(context)
    PM->>P: afterToolExecute(context)
    Note over P: Modify result, log, trigger follow-up
    
    S-->>C: Final result
```

### Hook Details

| Hook                | When Called                     | Purpose                                                        |
| ------------------- | ------------------------------- | -------------------------------------------------------------- |
| `beforeToolExecute` | Before tool execution           | Intercept calls, modify args, skip execution (dynamic handoff) |
| `transformInput`    | Before execute (if not skipped) | Transform input arguments                                      |
| `transformOutput`   | After execute                   | Transform output result                                        |
| `afterToolExecute`  | After execution or skip         | Modify final result, logging, follow-up actions                |

### Hook Execution Order

```
callTool(name, args)
  │
  ├─► beforeToolExecute(context)
  │     ├─► Can return {skipExecution: true, result: ...}
  │     └─► Can return {modifiedArgs: ...}
  │
  ├─► [if not skipped] transformInput(args)
  │
  ├─► [if not skipped] tool.execute(args)
  │
  ├─► [if not skipped] transformOutput(result)
  │
  └─► afterToolExecute(context)
        └─► Can return {modifiedResult: ...}
```

## Plugin Execution Order

Plugins are sorted by `enforce` option:

```mermaid
flowchart LR
    subgraph Order["Execution Order"]
        A["enforce: 'pre'"] --> B["No enforce"] --> C["enforce: 'post'"]
    end
```

Within each group, plugins execute in registration order.

## Context Objects

### BeforeToolExecuteContext

```typescript
interface BeforeToolExecuteContext {
  toolName: string; // Tool being executed
  args: unknown; // Input arguments
  server: ComposableMCPServer;
  toolDefinition?: ComposedTool;
  isInternalCall: boolean; // true if called within agent
  agentName?: string; // Parent agent name (if internal)
  executionChain?: string[]; // Nested agent calls
}
```

### AfterToolExecuteContext

```typescript
interface AfterToolExecuteContext {
  toolName: string;
  args: unknown; // Original arguments
  result: unknown; // Execution result
  server: ComposableMCPServer;
  wasSkipped: boolean; // true if beforeToolExecute skipped
  executionTimeMs: number; // Execution duration
  isError: boolean; // Result indicates error
  metadata?: Record<string, unknown>; // From beforeToolExecute
  isInternalCall: boolean;
  agentName?: string;
}
```

### RuntimeTransformContext

```typescript
interface RuntimeTransformContext {
  toolName: string;
  server: ComposableMCPServer;
  originalArgs?: unknown; // Available in transformOutput
  direction: "input" | "output";
}
```

## Use Cases

### 1. Dynamic Tool Handoff to AI Agent

Use `beforeToolExecute` to intercept tool calls and delegate to an AI agent:

```typescript
const aiHandoffPlugin = {
  name: "ai-handoff",
  beforeToolExecute: async (context) => {
    if (shouldDelegateToAI(context.toolName)) {
      const aiResult = await askAI(context.toolName, context.args);
      return {
        skipExecution: true,
        result: { content: [{ type: "text", text: aiResult }] },
        metadata: { handedOff: true },
      };
    }
  },
  afterToolExecute: (context) => {
    if (context.metadata?.handedOff) {
      console.log(`AI handled ${context.toolName}`);
    }
  },
};
```

### 2. Argument Validation & Transformation

```typescript
const validationPlugin = {
  name: "validation",
  beforeToolExecute: (context) => {
    const validated = validateArgs(context.args);
    if (validated.errors) {
      return {
        skipExecution: true,
        result: {
          content: [{ type: "text", text: validated.errors }],
          isError: true,
        },
      };
    }
    return { modifiedArgs: validated.sanitized };
  },
};
```

### 3. Execution Logging & Metrics

```typescript
const metricsPlugin = {
  name: "metrics",
  beforeToolExecute: (context) => {
    return { metadata: { startTime: Date.now() } };
  },
  afterToolExecute: (context) => {
    const duration = Date.now() - (context.metadata?.startTime || 0);
    metrics.record(context.toolName, {
      duration,
      success: !context.isError,
      wasSkipped: context.wasSkipped,
    });
  },
};
```

### 4. Agent Context Tracking

```typescript
const contextPlugin = {
  name: "context-tracker",
  beforeToolExecute: (context) => {
    if (context.isInternalCall) {
      console.log(`Agent "${context.agentName}" calling ${context.toolName}`);
      console.log(`Execution chain: ${context.executionChain?.join(" → ")}`);
    }
  },
};
```

## Complete Lifecycle Example

```mermaid
flowchart TB
    subgraph Init["1. Initialization"]
        A1[mcpc] --> A2[addPlugin]
        A2 --> A3[configureServer]
    end
    
    subgraph Compose["2. Composition"]
        B1[compose] --> B2[composeStart]
        B2 --> B3[transformTool x N]
        B3 --> B4[finalizeComposition]
        B4 --> B5[registerAgentTool]
        B5 --> B6[composeEnd]
    end
    
    subgraph Run["3. Runtime"]
        C1[MCP Client Request] --> C2[beforeToolExecute]
        C2 --> C3{Skip?}
        C3 -->|No| C4[transformInput]
        C4 --> C5[Execute]
        C5 --> C6[transformOutput]
        C6 --> C7[afterToolExecute]
        C3 -->|Yes| C7
        C7 --> C8[Response]
    end
    
    subgraph End["4. Cleanup"]
        D1[Server Close] --> D2[dispose]
    end
    
    Init --> Compose
    Compose --> Run
    Run -.->|Repeated| Run
    Run --> End
```

## Best Practices

1. **Use `beforeToolExecute` for**:
   - Dynamic delegation/handoff
   - Early validation
   - Skipping expensive operations
   - Passing metadata to `afterToolExecute`

2. **Use `transformInput/transformOutput` for**:
   - Data format transformation
   - Sanitization
   - Schema normalization

3. **Use `afterToolExecute` for**:
   - Logging and metrics
   - Result modification
   - Triggering side effects
   - Cleanup after tool execution

4. **Prefer `beforeToolExecute` over `transformInput`** when you might skip
   execution entirely.

5. **Pass state via `metadata`** from `beforeToolExecute` to `afterToolExecute`
   instead of using plugin instance state.

## Related Documentation

- [Plugin System Guide](./plugins.md) - Creating and configuring plugins
- [Execution Modes](./execution-modes.md) - Different agent execution modes
