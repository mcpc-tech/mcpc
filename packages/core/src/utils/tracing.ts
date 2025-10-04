/**
 * OpenTelemetry Tracing Utility
 *
 * Provides tracing capabilities for sampling workflows using OpenTelemetry.
 * Traces can be exported to console, OTLP endpoint, or disabled entirely.
 */

import {
  context,
  type Span,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

let tracerProvider: NodeTracerProvider | null = null;
let tracer: Tracer | null = null;
let isInitialized = false;

export interface TracingConfig {
  enabled?: boolean;
  serviceName?: string;
  serviceVersion?: string;
  exportTo?: "console" | "otlp" | "none";
  otlpEndpoint?: string;
  otlpHeaders?: Record<string, string>;
}

/**
 * Initialize OpenTelemetry tracing
 */
export function initializeTracing(config: TracingConfig = {}): void {
  if (isInitialized) {
    return;
  }

  const {
    enabled = true,
    serviceName = "mcpc-sampling",
    serviceVersion = "0.2.0",
    exportTo = "console",
    otlpEndpoint = "http://localhost:4318/v1/traces",
    otlpHeaders = {},
  } = config;

  if (!enabled) {
    isInitialized = true;
    return;
  }

  // Create a resource describing this service
  const resource = Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
  );

  // Create the tracer provider
  tracerProvider = new NodeTracerProvider({
    resource,
  });

  // Configure exporter based on config
  if (exportTo === "console") {
    // Export to console for debugging
    tracerProvider.addSpanProcessor(
      new SimpleSpanProcessor(new ConsoleSpanExporter()),
    );
  } else if (exportTo === "otlp") {
    // Export to OTLP endpoint (e.g., Jaeger, Zipkin, or collector)
    const otlpExporter = new OTLPTraceExporter({
      url: otlpEndpoint,
      headers: otlpHeaders,
    });
    tracerProvider.addSpanProcessor(new BatchSpanProcessor(otlpExporter));
  }
  // If exportTo === "none", no processor is added (tracing disabled)

  // Register the provider
  tracerProvider.register();

  // Get a tracer
  tracer = trace.getTracer(serviceName, serviceVersion);
  isInitialized = true;
}

/**
 * Get the current tracer (initializes with defaults if not initialized)
 */
export function getTracer(): Tracer {
  if (!isInitialized) {
    initializeTracing();
  }
  return tracer!;
}

/**
 * Start a new span
 */
export function startSpan(
  name: string,
  attributes?: Record<string, unknown>,
  parent?: Span,
): Span {
  const tracer = getTracer();
  // If a parent span is provided, create a context with that parent so the
  // new span becomes a child of the provided parent. Otherwise use the
  // currently active context.
  const ctx = parent ? trace.setSpan(context.active(), parent) : undefined;
  return tracer.startSpan(
    name,
    {
      attributes: attributes as Record<string, string | number | boolean>,
    },
    ctx,
  );
}

/**
 * End a span with optional status
 */
export function endSpan(span: Span, error?: Error): void {
  if (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

/**
 * Execute a function within a span
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, unknown> = {},
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = startSpan(name, attributes);
  try {
    const result = await fn(span);
    endSpan(span);
    return result;
  } catch (error) {
    endSpan(span, error as Error);
    throw error;
  }
}

/**
 * Get the current active span
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Set attributes on the active span
 */
export function setSpanAttributes(attributes: Record<string, unknown>): void {
  const span = getActiveSpan();
  if (span) {
    span.setAttributes(attributes as Record<string, string | number | boolean>);
  }
}

/**
 * Add an event to the active span
 */
export function addSpanEvent(
  name: string,
  attributes?: Record<string, unknown>,
): void {
  const span = getActiveSpan();
  if (span) {
    span.addEvent(
      name,
      attributes as Record<string, string | number | boolean>,
    );
  }
}

/**
 * Shutdown tracing and flush all spans
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
    tracer = null;
    isInitialized = false;
  }
}
