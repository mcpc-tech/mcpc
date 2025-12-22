/**
 * AI SDK Sampling Executor - Uses MCP Sampling provider with streamText
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "ai";
import {
  MCPSamplingProvider,
  type MCPSamplingProviderOptions,
} from "@mcpc/mcp-sampling-ai-provider";
import {
  type AIExecutorConfig,
  BaseAIExecutor,
  type ExternalTool,
} from "./base-ai-executor.ts";
import type { ComposableMCPServer } from "../../compose.ts";

export interface AISamplingExecutorConfig extends AIExecutorConfig {
  server: Server | ComposableMCPServer;
  tools: [string, ExternalTool][];
  providerOptions?: MCPSamplingProviderOptions;
}

export class AISamplingExecutor extends BaseAIExecutor {
  private server: Server | ComposableMCPServer;
  private tools: [string, ExternalTool][];
  private providerOptions?: MCPSamplingProviderOptions;
  private model: LanguageModelV2 | null = null;

  constructor(config: AISamplingExecutorConfig) {
    super(
      config,
      "callTool" in config.server
        ? (config.server as ComposableMCPServer)
        : undefined,
    );
    this.server = config.server;
    this.tools = config.tools;
    this.providerOptions = config.providerOptions;
  }

  private initProvider(): LanguageModelV2 {
    if (!this.model) {
      const provider = new MCPSamplingProvider({ server: this.server });
      this.model = provider.languageModel(this.providerOptions);
    }
    return this.model;
  }

  protected getModel(): LanguageModelV2 {
    if (!this.model) throw new Error("Model not initialized");
    return this.model;
  }

  protected getExecutorType(): "mcp" {
    return "mcp";
  }

  protected override getToolListDescription(): string {
    return this.tools
      .map(([name, detail]) =>
        `- ${name}: ${detail.description || "No description"}`
      )
      .join("\n");
  }

  protected buildTools(): Record<string, Tool<any, any>> {
    const aiTools: Record<string, Tool<any, any>> = {};
    for (const [name, detail] of this.tools) {
      aiTools[name] = this.convertToAISDKTool(name, detail, async (input) => {
        const result = await this.callTool(name, input);
        return this.formatResult(result);
      });
    }
    return aiTools;
  }

  private async callTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<CallToolResult> {
    if ("callTool" in this.server) {
      return (await (this.server as ComposableMCPServer).callTool(
        name,
        input,
      )) as CallToolResult;
    }
    const detail = this.tools.find(([n]) => n === name)?.[1];
    if (detail?.execute) return await detail.execute(input);
    throw new Error(`Cannot call tool "${name}"`);
  }

  private formatResult(result: CallToolResult): unknown {
    const texts = result.content
      ?.filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text);
    return texts?.length ? texts.join("\n") : JSON.stringify(result.content);
  }

  override execute(
    args: Parameters<BaseAIExecutor["execute"]>[0],
  ): Promise<CallToolResult> {
    this.initProvider();
    return super.execute(args);
  }
}
