import type { ComposableMCPServer } from "@mcpc/core";
import {
  MCPSamplingProvider,
  type MCPSamplingProviderOptions,
} from "@mcpc/mcp-sampling-ai-provider";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";

export interface SandboxSamplingResult {
  /** Parsed structured output, null if an error occurred */
  data: unknown;
  /** Error message if sampling or JSON parsing failed, undefined on success */
  error?: string;
}

export interface SandboxSamplingHandlerOptions {
  server: ComposableMCPServer;
  maxSteps?: number;
  maxTokens?: number;
  modelPreferences?: MCPSamplingProviderOptions["modelPreferences"];
}

export interface SandboxSamplingHandler {
  (prompt: unknown, outputSchema: unknown): Promise<SandboxSamplingResult>;
}

const DEFAULT_MAX_STEPS = 8;

export function createSandboxSamplingHandler(
  options: SandboxSamplingHandlerOptions,
): SandboxSamplingHandler {
  return async (prompt: unknown, outputSchema: unknown) => {
    try {
      if (typeof prompt !== "string" || prompt.length === 0) {
        throw new Error(
          "sampling() first argument must be a non-empty prompt string.",
        );
      }

      if (!outputSchema || typeof outputSchema !== "object") {
        throw new Error(
          "sampling() second argument (outputSchema) is required and must be a JSON Schema object.",
        );
      }

      const capabilities = options.server.getClientCapabilities();
      if (!capabilities?.sampling) {
        throw new Error(
          "The connected MCP client does not advertise sampling support.",
        );
      }

      const provider = new MCPSamplingProvider({
        server: options.server,
        maxTokens: options.maxTokens,
      });

      const model = provider.languageModel({
        modelPreferences: options.modelPreferences,
      });

      let submittedResult: unknown = undefined;

      await generateText({
        model,
        prompt,
        tools: {
          submit_result: tool({
            description:
              "Submit the final structured result. You MUST call this tool once with your answer.",
            inputSchema: jsonSchema(
              outputSchema as Record<string, unknown>,
            ),
            execute: (args) => {
              submittedResult = args;
              return Promise.resolve("Result submitted.");
            },
          }),
        },
        stopWhen: stepCountIs(options.maxSteps ?? DEFAULT_MAX_STEPS),
      });

      if (submittedResult === undefined) {
        throw new Error(
          "Model did not call submit_result. Try rephrasing your prompt.",
        );
      }

      return { data: submittedResult };
    } catch (e) {
      return {
        data: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };
}
