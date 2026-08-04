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
