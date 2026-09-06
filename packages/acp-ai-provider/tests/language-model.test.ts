/**
 * Tests for ACP Language Model
 */

import { assertEquals, assertExists, assertRejects } from "@std/assert";
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

Deno.test("ACPLanguageModel - implements LanguageModelV3 interface", () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );

  // Check required LanguageModelV3 properties
  assertEquals(model.modelId, "test-agent");
  assertEquals(model.specificationVersion, "v3");
  assertEquals(model.provider, "acp");
  assertEquals(typeof model.doGenerate, "function");
  assertEquals(typeof model.doStream, "function");
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
  }).ensureConnected = () => {
    (model as unknown as {
      sessionId: string;
      client: unknown;
      connection: unknown;
    }).sessionId = "session-1";
    return Promise.resolve();
  };

  (model as unknown as {
    promptWithLazyAuthRetry: (
      request: unknown,
    ) => Promise<{ stopReason: string }>;
  }).promptWithLazyAuthRetry = () =>
    Promise.resolve(
      promptResponses[responseIndex++] as {
        stopReason: string;
      },
    );

  (model as unknown as { cleanup: () => void }).cleanup = () => {};

  const finishReasons: string[] = [];

  for (let i = 0; i < promptResponses.length; i++) {
    const result = await model.doGenerate({
      prompt: [{ role: "user", content: "test" }],
    } as any);
    finishReasons.push(result.finishReason.unified);
    assertEquals(result.finishReason.raw, promptResponses[i].stopReason);
  }

  assertEquals(finishReasons, [
    "stop",
    "length",
    "length",
    "other",
    "other",
  ]);
});

function setupConfigOptionModel() {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const requests: unknown[] = [];
  const initialOptions = [
    {
      id: "agent-specific-reasoning-id",
      name: "Thinking effort",
      description: "Controls reasoning effort",
      category: "thought_level",
      type: "select" as const,
      currentValue: "medium",
      options: [
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
      ],
    },
    {
      id: "agent-specific-style-id",
      name: "Style",
      category: "_style",
      type: "select" as const,
      currentValue: "concise",
      options: [{ value: "concise", name: "Concise" }],
    },
  ];

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: initialOptions,
  };
  (model as unknown as { connection: unknown }).connection = {
    setSessionConfigOption: (request: unknown) => {
      requests.push(request);
      return Promise.resolve({
        configOptions: [
          { ...initialOptions[0], currentValue: "high" },
          initialOptions[1],
        ],
      });
    },
  };

  return { model, requests };
}

Deno.test("setConfigOption forwards arbitrary IDs and refreshes config options", async () => {
  const { model, requests } = setupConfigOptionModel();

  const response = await model.setConfigOption(
    "agent-defined-id",
    "agent-defined-value",
  );

  assertEquals(requests, [{
    sessionId: "session-1",
    configId: "agent-defined-id",
    value: "agent-defined-value",
  }]);
  assertEquals(response.configOptions[0].currentValue, "high");
  assertEquals(
    model.getConfigOptions("thought_level")[0].currentValue,
    "high",
  );
});

Deno.test("setThoughtLevel resolves the agent-advertised config ID by category", async () => {
  const { model, requests } = setupConfigOptionModel();

  await model.setThoughtLevel("high");

  assertEquals(requests, [{
    sessionId: "session-1",
    configId: "agent-specific-reasoning-id",
    value: "high",
  }]);
  assertEquals(
    model.getConfigOptions("_style")[0].id,
    "agent-specific-style-id",
  );
});

Deno.test("config option updates refresh the active session cache", () => {
  const { model } = setupConfigOptionModel();
  const updatedOption = {
    ...model.getConfigOptions("thought_level")[0],
    currentValue: "low",
  };

  (model as unknown as {
    handleStreamNotification: (
      controller: { enqueue: (_part: unknown) => void },
      notification: unknown,
    ) => void;
  }).handleStreamNotification(
    { enqueue: () => {} },
    {
      sessionId: "session-1",
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [updatedOption],
      },
    },
  );

  assertEquals(model.getConfigOptions(), [updatedOption]);
});

Deno.test("setConfigOptionByCategory rejects missing and ambiguous categories", async () => {
  const { model } = setupConfigOptionModel();

  await assertRejects(
    () => model.setConfigOptionByCategory("model_config", "x"),
    Error,
    'No session config option is available for category "model_config".',
  );

  const options = model.getConfigOptions();
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [
      ...options,
      { ...options[0], id: "second-reasoning-id" },
    ],
  };

  await assertRejects(
    () => model.setThoughtLevel("low"),
    Error,
    "Multiple session config options are available",
  );
});

function createModelConfigOption(currentValue: string) {
  return {
    id: "model",
    name: "Model",
    category: "model",
    type: "select" as const,
    currentValue,
    options: [
      { value: "gemini-3.7-flash-high", name: "High" },
      { value: "gemini-3.7-flash", name: "Standard" },
    ],
  };
}

function createModeConfigOption(currentValue: string) {
  return {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select" as const,
    currentValue,
    options: [
      { value: "default", name: "Default" },
      { value: "plan", name: "Plan" },
    ],
  };
}

Deno.test("setModel routes through the agent's session config option", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const modelOption = createModelConfigOption("gemini-3.7-flash-high");
  const requests: unknown[] = [];
  let legacyCalled = false;

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [modelOption],
  };
  (model as unknown as { connection: unknown }).connection = {
    setSessionConfigOption: (request: unknown) => {
      requests.push(request);
      return Promise.resolve({
        configOptions: [
          {
            ...modelOption,
            currentValue: (request as { value: string }).value,
          },
        ],
      });
    },
    unstable_setSessionModel: () => {
      legacyCalled = true;
      return Promise.resolve({});
    },
  };

  await model.setModel("gemini-3.7-flash");

  assertEquals(requests, [{
    sessionId: "session-1",
    configId: "model",
    value: "gemini-3.7-flash",
  }]);
  assertEquals(legacyCalled, false);
  assertEquals(
    model.getConfigOptions("model")[0].currentValue,
    "gemini-3.7-flash",
  );
});

Deno.test("setModel validates the value against the advertised model option", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const modelOption = createModelConfigOption("gemini-3.7-flash-high");

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [modelOption],
  };
  (model as unknown as { connection: unknown }).connection = {
    setSessionConfigOption: () =>
      Promise.resolve({ configOptions: [modelOption] }),
  };

  await assertRejects(
    () => model.setModel("gemini-4"),
    Error,
    "is not available",
  );
});

Deno.test("setModel falls back to the legacy model API without a model config option", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const requests: unknown[] = [];

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    models: {
      availableModels: [{ modelId: "opus" }, { modelId: "haiku" }],
      currentModelId: "opus",
    },
  };
  (model as unknown as { connection: unknown }).connection = {
    unstable_setSessionModel: (request: unknown) => {
      requests.push(request);
      return Promise.resolve({});
    },
  };

  await model.setModel("haiku");

  assertEquals(requests, [{
    sessionId: "session-1",
    modelId: "haiku",
  }]);

  await assertRejects(
    () => model.setModel("claude"),
    Error,
    "is not available",
  );
});

Deno.test("setModel rejects ambiguous or missing model config options", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const modelOption = createModelConfigOption("gemini-3.7-flash-high");

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { connection: unknown }).connection = {
    setSessionConfigOption: () =>
      Promise.resolve({ configOptions: [modelOption] }),
  };
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [
      modelOption,
      { ...modelOption, id: "secondary-model" },
    ],
  };

  await assertRejects(
    () => model.setModel("gemini-3.7-flash"),
    Error,
    'Multiple session config options are available for category "model"',
  );

  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [
      {
        id: "style",
        name: "Style",
        category: "_style",
        type: "select",
        currentValue: "concise",
        options: [{ value: "concise", name: "Concise" }],
      },
    ],
  };

  await assertRejects(
    () => model.setModel("gemini-3.7-flash"),
    Error,
    'no model option with category "model"',
  );
});

Deno.test("setMode routes through the agent's session config option", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const modeOption = createModeConfigOption("default");
  const configRequests: unknown[] = [];
  const modeRequests: unknown[] = [];

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [modeOption],
  };
  (model as unknown as { connection: unknown }).connection = {
    setSessionConfigOption: (request: unknown) => {
      configRequests.push(request);
      return Promise.resolve({
        configOptions: [
          { ...modeOption, currentValue: (request as { value: string }).value },
        ],
      });
    },
    setSessionMode: (request: unknown) => {
      modeRequests.push(request);
      return Promise.resolve({});
    },
  };

  await model.setMode("plan");

  assertEquals(configRequests, [{
    sessionId: "session-1",
    configId: "mode",
    value: "plan",
  }]);
  assertEquals(modeRequests, []);
  assertEquals(
    model.getConfigOptions("mode")[0].currentValue,
    "plan",
  );
});

Deno.test("setMode validates the value against the advertised mode option", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const modeOption = createModeConfigOption("default");

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [modeOption],
  };
  (model as unknown as { connection: unknown }).connection = {
    setSessionConfigOption: () =>
      Promise.resolve({ configOptions: [modeOption] }),
  };

  await assertRejects(
    () => model.setMode("ask"),
    Error,
    "is not available",
  );
});

Deno.test("setMode falls back to the session modes API without a mode config option", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const requests: unknown[] = [];

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    modes: {
      availableModes: [{ id: "default" }, { id: "plan" }],
      currentModeId: "default",
    },
  };
  (model as unknown as { connection: unknown }).connection = {
    setSessionMode: (request: unknown) => {
      requests.push(request);
      return Promise.resolve({});
    },
  };

  await model.setMode("plan");

  assertEquals(requests, [{
    sessionId: "session-1",
    modeId: "plan",
  }]);

  await assertRejects(
    () => model.setMode("ask"),
    Error,
    "is not available",
  );
});

Deno.test("setMode rejects ambiguous or missing mode config options", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  const modeOption = createModeConfigOption("default");

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { connection: unknown }).connection = {
    setSessionConfigOption: () =>
      Promise.resolve({ configOptions: [modeOption] }),
  };
  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [
      modeOption,
      { ...modeOption, id: "secondary-mode" },
    ],
  };

  await assertRejects(
    () => model.setMode("plan"),
    Error,
    'Multiple session config options are available for category "mode"',
  );

  (model as unknown as { sessionResponse: unknown }).sessionResponse = {
    sessionId: "session-1",
    configOptions: [
      {
        id: "style",
        name: "Style",
        category: "_style",
        type: "select",
        currentValue: "concise",
        options: [{ value: "concise", name: "Concise" }],
      },
    ],
  };

  await assertRejects(
    () => model.setMode("plan"),
    Error,
    'no mode option with category "mode"',
  );
});

Deno.test("startSession re-applies the configured model after session re-creation", async () => {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );
  model.modelId = "gemini-3.7-flash";
  const modelOption = createModelConfigOption("gemini-3.7-flash-high");
  const requests: unknown[] = [];
  let sessionCounter = 0;

  (model as unknown as { connection: unknown }).connection = {
    newSession: () => {
      sessionCounter += 1;
      return Promise.resolve({
        sessionId: `session-${sessionCounter}`,
        configOptions: [modelOption],
      });
    },
    setSessionConfigOption: (request: unknown) => {
      requests.push(request);
      return Promise.resolve({
        configOptions: [
          {
            ...modelOption,
            currentValue: (request as { value: string }).value,
          },
        ],
      });
    },
  };

  await model.startSession();
  assertEquals(requests.length, 1);

  // Simulate a cleanup that drops the session but leaves a stale model state.
  (model as unknown as { sessionId: string | null }).sessionId = null;
  (model as unknown as { currentModelId: string | null }).currentModelId =
    "gemini-3.7-flash";

  await model.startSession();

  assertEquals(requests, [
    {
      sessionId: "session-1",
      configId: "model",
      value: "gemini-3.7-flash",
    },
    {
      sessionId: "session-2",
      configId: "model",
      value: "gemini-3.7-flash",
    },
  ]);
});

/**
 * Helpers for abort/cancel tests: stubs the ACP internals so we can drive
 * prompt resolution and observe session/cancel + prompt ordering.
 */
function setupMockModel() {
  const model = new ACPLanguageModel(
    "test-agent",
    undefined,
    createProviderSettings(),
  );

  const events: string[] = [];
  const promptDeferreds: Array<{
    resolve: (value: { stopReason: string }) => void;
    reject: (error: unknown) => void;
  }> = [];
  const promptRequests: Array<{ sessionId: string }> = [];
  let promptCount = 0;
  let cancelCount = 0;
  let updateHandler: ((notification: unknown) => void) | null = null;

  (model as unknown as { sessionId: string }).sessionId = "session-1";
  (model as unknown as { connection: unknown }).connection = {
    cancel: () => {
      cancelCount++;
      events.push("cancel");
    },
  };
  (model as unknown as { client: unknown }).client = {
    setSessionUpdateHandler: (handler: (notification: unknown) => void) => {
      updateHandler = handler;
    },
  };
  (model as unknown as { ensureConnected: () => void })
    .ensureConnected = () => {
      events.push("connect");
    };
  (model as unknown as {
    promptWithLazyAuthRetry: (request: {
      sessionId: string;
      prompt: unknown;
    }) => Promise<{ stopReason: string }>;
  }).promptWithLazyAuthRetry = (request: {
    sessionId: string;
    prompt: unknown;
  }) => {
    promptCount++;
    promptRequests.push(request);
    events.push("prompt");
    return new Promise<{ stopReason: string }>((resolve, reject) => {
      promptDeferreds.push({ resolve, reject });
    });
  };
  (model as unknown as { cleanup: () => void }).cleanup = () => {};

  return {
    model,
    events,
    promptDeferreds,
    promptRequests,
    promptCount: () => promptCount,
    cancelCount: () => cancelCount,
    updateHandler: () => updateHandler,
  };
}

async function readAll(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const reader = stream.getReader();
  const parts: unknown[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

async function readNext(
  reader: ReadableStreamDefaultReader<any>,
): Promise<any> {
  const { done, value } = await reader.read();
  assertEquals(done, false);
  return value;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const basicOptions = {
  prompt: [{ role: "user" as const, content: "hello" }],
};

Deno.test("doStream - normal stream is unaffected by abort handling", async () => {
  const h = setupMockModel();
  const { stream } = await h.model.doStream(basicOptions as never);

  h.promptDeferreds[0].resolve({ stopReason: "end_turn" });
  const parts = await readAll(stream);

  assertEquals(h.promptCount(), 1);
  assertEquals(h.cancelCount(), 0);
  const finish = parts.find((p) => (p as { type: string }).type === "finish");
  assertExists(finish);
  assertEquals(
    (finish as { finishReason: { raw: string } }).finishReason.raw,
    "end_turn",
  );
});

Deno.test("doStream - abort during output sends session/cancel once and ends with cancelled", async () => {
  const h = setupMockModel();
  const controller = new AbortController();
  const { stream } = await h.model.doStream({
    ...basicOptions,
    abortSignal: controller.signal,
  } as never);

  const reader = stream.getReader();
  assertEquals(await readNext(reader), {
    type: "stream-start",
    warnings: [],
  });

  controller.abort();
  await tick();

  assertEquals(h.cancelCount(), 1);
  assertEquals(h.events, ["connect", "prompt", "cancel"]);

  h.promptDeferreds[0].resolve({ stopReason: "cancelled" });
  const finish = await readNext(reader);
  assertEquals(finish.type, "finish");
  assertEquals(finish.finishReason.raw, "cancelled");
  assertEquals((await reader.read()).done, true);
});

Deno.test("doStream - abort while prompt is in flight (tool execution) still drains cleanly", async () => {
  const h = setupMockModel();
  const controller = new AbortController();
  const { stream } = await h.model.doStream({
    ...basicOptions,
    abortSignal: controller.signal,
  } as never);

  const reader = stream.getReader();
  await reader.read(); // stream-start

  // Abort while the agent is still working (e.g. running a tool).
  controller.abort();
  await tick();
  assertEquals(h.cancelCount(), 1);

  // The original prompt eventually responds with `cancelled`.
  h.promptDeferreds[0].resolve({ stopReason: "cancelled" });
  assertEquals((await readNext(reader)).type, "finish");
  assertEquals((await reader.read()).done, true);
});

Deno.test("doStream - aborted turn fully drains before the next prompt is issued", async () => {
  const h = setupMockModel();
  const controller = new AbortController();

  const streamPromise1 = h.model.doStream({
    ...basicOptions,
    abortSignal: controller.signal,
  } as never);
  const { stream: stream1 } = await streamPromise1;
  const reader1 = stream1.getReader();
  await reader1.read(); // stream-start

  controller.abort();
  await tick();
  assertEquals(h.cancelCount(), 1);

  // Kick off the second turn while the first is still draining.
  const streamPromise2 = h.model.doStream(basicOptions as never);
  await tick();

  // The second prompt must NOT be issued before the first turn settles.
  assertEquals(h.promptCount(), 1);

  h.promptDeferreds[0].resolve({ stopReason: "cancelled" });

  const { stream: stream2 } = await streamPromise2;
  assertEquals(h.promptCount(), 2);
  assertEquals(h.promptRequests[0].sessionId, "session-1");
  assertEquals(h.promptRequests[1].sessionId, "session-1");
  // Acceptance order: prompt#1 -> cancel -> prompt#1 settles -> prompt#2.
  assertEquals(h.events, ["connect", "prompt", "cancel", "connect", "prompt"]);

  h.promptDeferreds[1].resolve({ stopReason: "end_turn" });
  const parts2 = await readAll(stream2);
  const finish2 = parts2.find((p) => (p as { type: string }).type === "finish");
  assertExists(finish2);
  assertEquals(
    (finish2 as { finishReason: { raw: string } }).finishReason.raw,
    "end_turn",
  );

  // First stream also terminates cleanly with `cancelled`.
  assertEquals((await readNext(reader1)).type, "finish");
  assertEquals((await reader1.read()).done, true);
});

Deno.test("doStream - stale session/update after close is dropped without throwing", async () => {
  const h = setupMockModel();
  const controller = new AbortController();
  const { stream } = await h.model.doStream({
    ...basicOptions,
    abortSignal: controller.signal,
  } as never);

  const reader = stream.getReader();
  await reader.read(); // stream-start

  // Updates while the stream is open still flow through.
  h.updateHandler()!({
    sessionId: "session-1",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "hi" },
    },
  } as never);
  assertEquals((await readNext(reader)).type, "text-start");
  assertEquals((await readNext(reader)).type, "text-delta");

  controller.abort();
  await tick();
  h.promptDeferreds[0].resolve({ stopReason: "cancelled" });
  assertEquals((await readNext(reader)).type, "finish");
  assertEquals((await reader.read()).done, true);

  // A late notification from the old turn must not write to the closed
  // controller (no "Controller is already closed").
  h.updateHandler()!({
    sessionId: "session-1",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "late" },
    },
  } as never);
  assertEquals(h.cancelCount(), 1);
});

Deno.test("doStream - consumer cancel() sends ACP cancel and waits for the turn to drain", async () => {
  const h = setupMockModel();
  const { stream } = await h.model.doStream(basicOptions as never);

  const reader = stream.getReader();
  await reader.read(); // stream-start

  const cancelPromise = reader.cancel();
  await tick();
  assertEquals(h.cancelCount(), 1);

  h.promptDeferreds[0].resolve({ stopReason: "cancelled" });
  await cancelPromise;
});

Deno.test("doStream - pre-aborted signal skips prompt and cancel entirely", async () => {
  const h = setupMockModel();
  const controller = new AbortController();
  controller.abort();

  const { stream } = await h.model.doStream({
    ...basicOptions,
    abortSignal: controller.signal,
  } as never);

  const parts = await readAll(stream);
  assertEquals(parts.length, 1);
  assertEquals((parts[0] as { type: string }).type, "stream-start");
  assertEquals(h.promptCount(), 0);
  assertEquals(h.cancelCount(), 0);
});
