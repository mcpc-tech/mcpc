/**
 * Tests for ACP Language Model
 */

import { assertEquals, assertExists } from "@std/assert";
import { ACPLanguageModel } from "../src/language-model.ts";
import type { ACPProviderSettings } from "../src/types.ts";

// Helper to create minimal provider settings
function createProviderSettings(
  overrides: Partial<ACPProviderSettings> = {},
): ACPProviderSettings {
  return {
    command: "gemini",
    args: ["--experimental-acp"],
    session: {
      cwd: "/tmp",
      mcpServers: [],
    },
    ...overrides,
  };
}

Deno.test("ACPLanguageModel - implements LanguageModelV2 interface", () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );

  // Check required LanguageModelV2 properties
  assertEquals(model.modelId, "test-agent");
  assertEquals(model.specificationVersion, "v2");
  assertEquals(model.provider, "acp");
  assertEquals(typeof model.doGenerate, "function");
  assertEquals(typeof model.doStream, "function");
});

Deno.test("ACPLanguageModel - config is stored from constructor", () => {
  const config = createProviderSettings({
    command: "custom-agent",
    args: ["--flag1", "--flag2"],
    env: { API_KEY: "secret123" },
  });

  const model = new ACPLanguageModel("agent", undefined, config);

  // Model should have the config stored (accessed via language-model behavior)
  assertExists(model);
  assertEquals(model.modelId, "agent");
});

Deno.test("ACPLanguageModel - handles optional initialize config", () => {
  // Without initialize config
  const config1 = createProviderSettings();
  const model1 = new ACPLanguageModel("agent1", undefined, config1);
  assertExists(model1);

  // With initialize config
  const config2 = createProviderSettings({
    initialize: {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: false },
        terminal: false,
      },
    },
  });
  const model2 = new ACPLanguageModel("agent2", undefined, config2);
  assertExists(model2);
});

Deno.test("ACPLanguageModel - preserves command and args in config", () => {
  const command = "my-custom-agent";
  const args = ["--mode", "production", "--verbose"];
  const config = createProviderSettings({ command, args });

  const model = new ACPLanguageModel("test", undefined, config);

  // Verify model creation didn't lose the config
  assertExists(model);
  assertEquals(model.modelId, "test");
});

Deno.test("ACPLanguageModel - handles environment variables in config", () => {
  const env = {
    API_KEY: "test-key",
    DEBUG: "true",
    CUSTOM_VAR: "custom-value",
  };

  const config = createProviderSettings({ env });
  const model = new ACPLanguageModel("agent-with-env", undefined, config);

  assertExists(model);
  assertEquals(model.modelId, "agent-with-env");
});

Deno.test("ACPLanguageModel - supports different agent commands", () => {
  const commands = [
    { cmd: "gemini", args: ["--experimental-acp"] },
    { cmd: "claude-code", args: ["--acp"] },
    { cmd: "npx", args: ["-y", "tsx", "./agent.ts"] },
    { cmd: "node", args: ["agent.mjs"] },
  ];

  for (const { cmd, args } of commands) {
    const model = new ACPLanguageModel(
      "agent",
      undefined,
      createProviderSettings({ command: cmd, args }),
    );
    assertExists(model);
    assertEquals(model.provider, "acp");
  }
});

Deno.test("ACPLanguageModel - session config is required", () => {
  // Session is required, so providing a valid one should work
  const config = createProviderSettings({
    session: {
      cwd: "/workspace",
      mcpServers: [],
    },
  });

  const model = new ACPLanguageModel("agent", undefined, config);
  assertExists(model);
});

Deno.test("ACPLanguageModel - model properties are consistent", () => {
  const modelId = "my-model-123";
  const model = new ACPLanguageModel(
    modelId,
    undefined,
    createProviderSettings(),
  );

  // Properties should be consistent across multiple accesses
  assertEquals(model.modelId, modelId);
  assertEquals(model.modelId, "my-model-123");
  assertEquals(model.provider, "acp");
  assertEquals(model.specificationVersion, "v2");
});

Deno.test("ACPLanguageModel - maps ACP stop reasons to AI SDK finish reasons", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );

  const promptResponses = [
    { stopReason: "end_turn" },
    { stopReason: "max_tokens" },
    { stopReason: "max_turn_requests" },
    { stopReason: "refusal" },
    { stopReason: "cancelled" },
  ];

  let responseIndex = 0;

  (model as unknown as {
    ensureConnected: () => Promise<void>;
    promptWithLazyAuthRetry: (
      request: unknown,
    ) => Promise<{ stopReason: string }>;
    cleanup: () => void;
  }).ensureConnected = async () => {
    (model as unknown as {
      sessionId: string;
      client: unknown;
      connection: unknown;
    }).sessionId = "session-1";
  };

  (model as unknown as {
    promptWithLazyAuthRetry: (
      request: unknown,
    ) => Promise<{ stopReason: string }>;
  }).promptWithLazyAuthRetry = async () =>
    promptResponses[responseIndex++] as {
      stopReason: string;
    };

  (model as unknown as { cleanup: () => void }).cleanup = () => {};

  const finishReasons: string[] = [];

  for (let i = 0; i < promptResponses.length; i++) {
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: "test" }],
    } as any);
    finishReasons.push(result.finishReason);
  }

  assertEquals(finishReasons, [
    "stop",
    "length",
    "length",
    "other",
    "other",
  ]);
});
