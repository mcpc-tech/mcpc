import { assertEquals } from "@std/assert";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import {
  buildJsonSchemaPrompt,
  createJsonCleanupTransform,
  isJsonResponseFormat,
  stripMarkdownFences,
} from "../src/json-output.ts";

Deno.test("isJsonResponseFormat", async (t) => {
  await t.step("returns true for json type", () => {
    assertEquals(isJsonResponseFormat({ type: "json" }), true);
  });

  await t.step("returns false for text type", () => {
    assertEquals(isJsonResponseFormat({ type: "text" }), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isJsonResponseFormat(undefined), false);
  });
});

Deno.test("buildJsonSchemaPrompt", async (t) => {
  await t.step("contains JSON output instruction", () => {
    const prompt = buildJsonSchemaPrompt({ type: "json" });
    assertEquals(prompt.includes("[Structured Output Instruction]"), true);
    assertEquals(prompt.includes("valid JSON value"), true);
  });

  await t.step("contains schema when provided", () => {
    const prompt = buildJsonSchemaPrompt({
      type: "json",
      schema: { type: "object", properties: { a: { type: "string" } } },
    });
    assertEquals(prompt.includes("JSON Schema"), true);
    assertEquals(prompt.includes('"a"'), true);
  });

  await t.step("contains name and description when provided", () => {
    const prompt = buildJsonSchemaPrompt({
      type: "json",
      name: "Recipe",
      description: "A cooking recipe",
    });
    assertEquals(prompt.includes("Recipe"), true);
    assertEquals(prompt.includes("A cooking recipe"), true);
  });
});

Deno.test("stripMarkdownFences", async (t) => {
  await t.step("strips ```json fences", () => {
    const input = '```json\n{"a":1}\n```';
    assertEquals(stripMarkdownFences(input), '{"a":1}');
  });

  await t.step("strips plain ``` fences", () => {
    const input = '```\n{"a":1}\n```';
    assertEquals(stripMarkdownFences(input), '{"a":1}');
  });

  await t.step("returns plain JSON as-is (trimmed)", () => {
    const input = '  {"a":1}  ';
    assertEquals(stripMarkdownFences(input), '{"a":1}');
  });

  await t.step("handles multiline JSON in fences", () => {
    const input = '```json\n{\n  "a": 1,\n  "b": 2\n}\n```';
    assertEquals(stripMarkdownFences(input), '{\n  "a": 1,\n  "b": 2\n}');
  });

  await t.step("does not strip partial fences", () => {
    const input = '```json\n{"a":1}';
    assertEquals(stripMarkdownFences(input), '```json\n{"a":1}');
  });
});

Deno.test("createJsonCleanupTransform", async (t) => {
  async function collectStream(
    parts: LanguageModelV3StreamPart[],
  ): Promise<LanguageModelV3StreamPart[]> {
    const input = new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(part);
        }
        controller.close();
      },
    });

    const output = input.pipeThrough(createJsonCleanupTransform());
    const reader = output.getReader();
    const result: LanguageModelV3StreamPart[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result.push(value);
    }

    return result;
  }

  function collectTextDeltas(parts: LanguageModelV3StreamPart[]): string[] {
    return parts.flatMap((part) =>
      part.type === "text-delta" ? [part.delta] : []
    );
  }

  await t.step("strips markdown fences from text blocks", async () => {
    const parts: LanguageModelV3StreamPart[] = [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "```json\n" },
      { type: "text-delta", id: "t1", delta: '{"a":1}' },
      { type: "text-delta", id: "t1", delta: "\n```" },
      { type: "text-end", id: "t1" },
    ];

    const result = await collectStream(parts);
    assertEquals(result.length, 3);
    assertEquals(result[0], { type: "text-start", id: "t1" });
    assertEquals(result[1], { type: "text-delta", id: "t1", delta: '{"a":1}' });
    assertEquals(result[2], { type: "text-end", id: "t1" });
  });

  await t.step(
    "preserves incremental streaming for larger JSON payloads",
    async () => {
      const parts: LanguageModelV3StreamPart[] = [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: '```json\n{"name":"Tok' },
        {
          type: "text-delta",
          id: "t1",
          delta: 'yo","country":"Japan","population":14',
        },
        { type: "text-delta", id: "t1", delta: "000000}\n```" },
        { type: "text-end", id: "t1" },
      ];

      const result = await collectStream(parts);
      const textDeltas = collectTextDeltas(result);

      assertEquals(result[0], { type: "text-start", id: "t1" });
      assertEquals(result[result.length - 1], { type: "text-end", id: "t1" });
      assertEquals(textDeltas.length >= 2, true);
      assertEquals(
        textDeltas.join(""),
        '{"name":"Tokyo","country":"Japan","population":14000000}',
      );
    },
  );

  await t.step("handles fence prefix split across chunks", async () => {
    const parts: LanguageModelV3StreamPart[] = [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "```j" },
      { type: "text-delta", id: "t1", delta: 'son\n{"city":"To' },
      { type: "text-delta", id: "t1", delta: 'kyo","country":"Japan"}\n```' },
      { type: "text-end", id: "t1" },
    ];

    const result = await collectStream(parts);
    assertEquals(
      collectTextDeltas(result).join(""),
      '{"city":"Tokyo","country":"Japan"}',
    );
  });

  await t.step("passes through clean JSON text unchanged", async () => {
    const parts: LanguageModelV3StreamPart[] = [
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: '{"a":1}' },
      { type: "text-end", id: "t1" },
    ];

    const result = await collectStream(parts);
    assertEquals(result.length, 3);
    assertEquals(result[1], { type: "text-delta", id: "t1", delta: '{"a":1}' });
  });

  await t.step("passes through non-text parts unchanged", async () => {
    const parts: LanguageModelV3StreamPart[] = [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: '{"a":1}' },
      { type: "text-end", id: "t1" },
      {
        type: "finish",
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: {
            total: undefined,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: undefined,
            text: undefined,
            reasoning: undefined,
          },
        },
      },
    ];

    const result = await collectStream(parts);
    assertEquals(result.length, 5);
    assertEquals(result[0].type, "stream-start");
    assertEquals(result[4].type, "finish");
  });
});
