import type {
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";

type JsonResponseFormat = {
  type: "json";
  schema?: Record<string, unknown>;
  name?: string;
  description?: string;
};

const OPENING_FENCE_PATTERN = /^```(?:\w+)?\s*\n/;
const CLOSING_FENCE_PATTERN = /\n?```\s*$/;
const SUFFIX_BUFFER_SIZE = 12;

type JsonTextStartPart = Extract<
  LanguageModelV2StreamPart,
  { type: "text-start" }
>;
type JsonTextBlockState = {
  startEvent: JsonTextStartPart;
  phase: "prefix" | "streaming";
  buffer: string;
  prefixStripped: boolean;
};

/**
 * Checks whether the call options request JSON output.
 * AI SDK sets `responseFormat.type === "json"` when using `Output.object()`,
 * `Output.array()`, `Output.choice()`, or `Output.json()`.
 */
export function isJsonResponseFormat(
  responseFormat: LanguageModelV2CallOptions["responseFormat"],
): responseFormat is JsonResponseFormat {
  return responseFormat?.type === "json";
}

/**
 * Builds an instruction block that tells the agent to respond with pure JSON.
 */
export function buildJsonSchemaPrompt(
  responseFormat: JsonResponseFormat,
): string {
  const parts: string[] = [];

  parts.push(
    "[Structured Output Instruction]",
    "You MUST respond with a single valid JSON value.",
    "Do NOT wrap JSON in markdown fences (no ```json blocks).",
    "Do NOT add explanations, comments, or any other text before or after the JSON.",
    "Your entire response must be ONLY the JSON value, nothing else.",
  );

  if (responseFormat.name) {
    parts.push(`Output name: ${responseFormat.name}`);
  }
  if (responseFormat.description) {
    parts.push(`Output description: ${responseFormat.description}`);
  }
  if (responseFormat.schema) {
    parts.push(
      "The JSON value MUST conform to this JSON Schema:",
      JSON.stringify(responseFormat.schema, null, 2),
    );
  }

  parts.push("[End Structured Output Instruction]");
  return parts.join("\n");
}

/**
 * Strips markdown code fences from text if present.
 * Handles ```json ... ``` and ``` ... ``` patterns.
 * Returns the inner content trimmed.
 *
 * If the text does not contain fences, returns it trimmed as-is.
 */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();

  // Match opening fence with optional language tag, content, closing fence
  const fenceMatch = trimmed.match(
    /^```(?:\w+)?\s*\n?([\s\S]*?)\n?\s*```\s*$/,
  );
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  return trimmed;
}

function emitTextDelta(
  controller: TransformStreamDefaultController<LanguageModelV2StreamPart>,
  id: string,
  delta: string,
): void {
  if (!delta) {
    return;
  }

  controller.enqueue({
    type: "text-delta",
    id,
    delta,
  });
}

function finalizeBufferedText(block: JsonTextBlockState): string {
  if (block.prefixStripped) {
    return block.buffer.replace(CLOSING_FENCE_PATTERN, "").trimEnd();
  }

  return stripMarkdownFences(block.buffer);
}

/**
 * Creates a TransformStream that strips markdown fences from JSON responses
 * while preserving incremental text streaming.
 *
 * This is the ACP-side equivalent of AI SDK's `extractJsonMiddleware`.
 * We cannot wait until `text-end` and then clean the whole payload, because
 * structured-output consumers derive incremental state from `text-delta`
 * events. Buffering the full block would make `textStream` /
 * `partialOutputStream` appear non-streaming.
 *
 * Strategy:
 * 1. Hold `text-start` briefly while we decide whether the first bytes are a
 *    markdown fence or raw JSON.
 * 2. If an opening fence is present, strip only that prefix once we have
 *    enough bytes to recognize it.
 * 3. While streaming, keep a tiny suffix buffer so a trailing closing fence
 *    can be removed without buffering the full response.
 * 4. Flush everything else immediately as `text-delta`.
 */
export function createJsonCleanupTransform(): TransformStream<
  LanguageModelV2StreamPart,
  LanguageModelV2StreamPart
> {
  const textBlocks: Record<string, JsonTextBlockState> = {};

  return new TransformStream<
    LanguageModelV2StreamPart,
    LanguageModelV2StreamPart
  >({
    transform(chunk, controller) {
      if (chunk.type === "text-start") {
        textBlocks[chunk.id] = {
          startEvent: chunk,
          phase: "prefix",
          buffer: "",
          prefixStripped: false,
        };
        return;
      }

      if (chunk.type === "text-delta") {
        const block = textBlocks[chunk.id];
        if (!block) {
          controller.enqueue(chunk);
          return;
        }

        block.buffer += chunk.delta;

        if (block.phase === "prefix") {
          if (block.buffer.length > 0 && !block.buffer.startsWith("`")) {
            block.phase = "streaming";
            controller.enqueue(block.startEvent);
          } else if (block.buffer.startsWith("```")) {
            if (block.buffer.includes("\n")) {
              const prefixMatch = block.buffer.match(OPENING_FENCE_PATTERN);
              block.phase = "streaming";
              if (prefixMatch) {
                block.buffer = block.buffer.slice(prefixMatch[0].length);
                block.prefixStripped = true;
              }
              controller.enqueue(block.startEvent);
            }
          } else if (
            block.buffer.length >= 3 && !block.buffer.startsWith("```")
          ) {
            block.phase = "streaming";
            controller.enqueue(block.startEvent);
          }
        }

        if (
          block.phase === "streaming" &&
          block.buffer.length > SUFFIX_BUFFER_SIZE
        ) {
          const toStream = block.buffer.slice(0, -SUFFIX_BUFFER_SIZE);
          block.buffer = block.buffer.slice(-SUFFIX_BUFFER_SIZE);
          emitTextDelta(controller, chunk.id, toStream);
        }
        return;
      }

      if (chunk.type === "text-end") {
        const block = textBlocks[chunk.id];
        if (!block) {
          controller.enqueue(chunk);
          return;
        }

        if (block.phase === "prefix") {
          controller.enqueue(block.startEvent);
        }

        emitTextDelta(controller, chunk.id, finalizeBufferedText(block));
        controller.enqueue(chunk);
        delete textBlocks[chunk.id];
        return;
      }

      controller.enqueue(chunk);
    },

    flush(controller) {
      for (const [id, block] of Object.entries(textBlocks)) {
        if (block.phase === "prefix") {
          controller.enqueue(block.startEvent);
        }
        emitTextDelta(controller, id, finalizeBufferedText(block));
      }
    },
  });
}
