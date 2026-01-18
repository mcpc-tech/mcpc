/**
 * AI SDK ACP Executor - Uses ACP provider (Claude Code, etc.) with streamText
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "ai";
import {
  type ACPProviderSettings,
  acpTools,
  createACPProvider,
} from "@mcpc/acp-ai-provider";
import {
  type AIExecutorConfig,
  BaseAIExecutor,
  type ExternalTool,
} from "./base-ai-executor.ts";

export type { ACPProviderSettings };

export interface AIACPExecutorConfig extends AIExecutorConfig {
  acpSettings: ACPProviderSettings;
  tools: [string, ExternalTool][];
}

export class AIACPExecutor extends BaseAIExecutor {
  private acpSettings: ACPProviderSettings;
  private tools: [string, ExternalTool][];
  private provider: ReturnType<typeof createACPProvider> | null = null;
  private model: LanguageModelV2 | null = null;

  constructor(config: AIACPExecutorConfig) {
    super(config);
    this.acpSettings = config.acpSettings;
    this.tools = config.tools;
  }

  private initProvider(): LanguageModelV2 {
    if (!this.model) {
      this.provider = createACPProvider(this.acpSettings);
      this.model = this.provider.languageModel();
    }
    return this.model!;
  }

  protected getModel(): LanguageModelV2 {
    if (!this.model) throw new Error("Model not initialized");
    return this.model;
  }

  protected getExecutorType(): "acp" {
    return "acp";
  }

  protected override getToolListDescription(): string {
    if (this.tools.length === 0) {
      return "Tools will be provided by ACP agent";
    }
    return this.tools
      .map(([name, detail]) =>
        `- ${name}: ${detail.description || "No description"}`
      )
      .join("\n");
  }

  protected buildTools(): Record<string, Tool<any, any>> {
    const aiTools: Record<string, Tool<any, any>> = {};
    for (const [name, detail] of this.tools) {
      if (!detail.execute) continue;
      aiTools[name] = this.convertToAISDKTool(name, detail, async (input) => {
        const result = await detail.execute!(input);
        return this.formatResult(result);
      });
    }
    // Wrap with acpTools to enable ACP agent to call these tools
    return acpTools(aiTools);
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

  cleanup(): void {
    if (this.provider && typeof this.provider.cleanup === "function") {
      this.provider.cleanup();
    }
    this.model = null;
    this.provider = null;
  }
}
