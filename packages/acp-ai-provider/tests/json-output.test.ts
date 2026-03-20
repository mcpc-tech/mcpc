import { assertEquals } from "@std/assert";
import type { LanguageModelV2StreamPart } from "@ai-sdk/provider";
import {
  buildJsonSchemaPrompt,
  createJsonCleanupTransform,
  isJsonResponseFormat,
  stripMarkdownFences,
} from "../src/json-output.ts";

Deno.test("isJsonResponseFormat", async (t) => {
  await t.step("returns true for json format", () => {
    assertEquals(isJsonResponseFormat({ type: "json" }), true);
  });
  await t.step("returns false for text format", () => {
    assertEquals(isJsonResponseFormat({ type: "text" }), false);
  });
  await t.step("returns false for undefined", () => {
    assertEquals(isJsonResponseFormat(undefined), false);
  });
});

Deno.test("buildJsonSchemaPrompt", async (t) => {
  await t.step("includes schema instruction", () => {
    const prompt = buildJsonSchemaPrompt({
      type: "json",
      name: "test",
      description: "A test schema",
      schema: { type: "object", properties: { foo: { type: "string" } } },
    });
    assertEquals(prompt.includes("[Structured Output Instruction]"), true);
    assertEquals(prompt.includes("Output name: test"), true);
    assertEquals(prompt.includes("A test schema"), true);
    assertEquals(prompt.includes('"foo"'), true);
  });

  await t.step("works without optional fields", () => {
    const prompt = buildJsonSchemaPrompt({ type: "json" });
    assertEquals(prompt.includes("[Structured Output Instruction]"), true);
    assertEquals(prompt.includes("Output name"), false);
  });
});

Deno.test("stripMarkdownFences", async (t) => {
  await t.step("strips ```json fences", () => {
    assertEquals(
      stripMarkdownFences('```json\n{"a":1}\n```'),
      '{"a":1}',
    );
  });

  await t.step("strips ``` fences without language", () => {
    assertEquals(
      stripMarkdownFences('```\n{"a":1}\n```'),
      '{"a":1}',
    );
  });

  await t.step("returns trimmed text when no fences", () => {
    assertEquals(stripMarkdownFences('  {"a":1}  '), '{"a":1}');
  });
});

Deno.test("createJsonCleanupTransform", async (t) => {
  async function collectStreamParts(
    input: LanguageModelV2StreamPart[],
  ): Promise<LanguageModelV2StreamPart[]> {
    const transform = createJsonCleanupTransform();
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();

    const results: LanguageModelV2StreamPart[] = [];
    const readAll = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        results.push(value);
      }
    })();

    for (const part of input) {
      await writer.write(part);
    }
    await writer.close();
    await readAll;
    return results;
  }

  function makeTextStream(
    id: string,
    chunks: string[],
  ): LanguageModelV2StreamPart[] {
    return [
      { type: "text-start", id } as LanguageModelV2StreamPart,
      ...chunks.map((delta) =>
        ({ type: "text-delta", id, delta }) as LanguageModelV2StreamPart
      ),
      { type: "text-end", id } as LanguageModelV2StreamPart,
    ];
  }

  function extractText(parts: LanguageModelV2StreamPart[]): string {
    return parts
      .filter((
        p,
      ): p is Extract<LanguageModelV2StreamPart, { type: "text-delta" }> =>
        p.type === "text-delta"
      )
      .map((p) => p.delta)
      .join("");
  }

  await t.step("strips ```json fences from stream", async () => {
    const parts = await collectStreamParts(
      makeTextStream("t1", ['```json\n{"a":1}\n```']),
    );
    assertEquals(extractText(parts), '{"a":1}');
  });

  await t.step("passes through non-fenced JSON", async () => {
    const parts = await collectStreamParts(
      makeTextStream("t1", ['{"a":1}']),
    );
    assertEquals(extractText(parts), '{"a":1}');
  });

  await t.step("handles fence split across chunks", async () => {
    const parts = await collectStreamParts(
      makeTextStream("t1", ["``", '`json\n{"a":', "1}\n```"]),
    );
    assertEquals(extractText(parts), '{"a":1}');
  });

  await t.step("passes through non-text events", async () => {
    const input: LanguageModelV2StreamPart[] = [
      { type: "stream-start", warnings: [] },
      ...makeTextStream("t1", ['{"a":1}']),
      {
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
    ];
    const parts = await collectStreamParts(input);
    assertEquals(parts[0].type, "stream-start");
    assertEquals(parts[parts.length - 1].type, "finish");
    assertEquals(extractText(parts), '{"a":1}');
  });

  await t.step("large JSON still streams incrementally", async () => {
    // Build a payload bigger than SUFFIX_BUFFER_SIZE (12)
    const bigJson = JSON.stringify({ data: "x".repeat(200) });
    const chunks: string[] = [];
    for (let i = 0; i < bigJson.length; i += 20) {
      chunks.push(bigJson.slice(i, i + 20));
    }
    const parts = await collectStreamParts(makeTextStream("t1", chunks));

    // Should have multiple text-delta events (not just one at the end)
    const deltas = parts.filter((p) => p.type === "text-delta");
    assertEquals(deltas.length > 1, true);
    assertEquals(extractText(parts), bigJson);
  });

  await t.step("fence prefix split across many small chunks", async () => {
    // Opening fence arrives one char at a time
    const chars = '```json\n{"ok":true}\n```'.split("");
    const parts = await collectStreamParts(makeTextStream("t1", chars));
    assertEquals(extractText(parts), '{"ok":true}');
  });
});
