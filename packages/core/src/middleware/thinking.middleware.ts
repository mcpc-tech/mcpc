import type { LanguageModelV1Middleware, LanguageModelV1StreamPart } from "ai";
import { z } from "zod";

/**
 * Configuration for reasoning format
 */
const ReasoningFormatConfig: z.ZodObject<any> = z.object({
  prefix: z.string().default("> "),
  prefixRethink: z.string().default("\n> "),
  linePrefix: z.string().default("\n\n> "),
  endSuffix: z.string().default("\n\n"),
});

export type ReasoningFormatConfig = z.infer<typeof ReasoningFormatConfig>;

/**
 * Default markdown quote formatting for reasoning blocks
 */
const DEFAULT_REASONING_FORMAT = ReasoningFormatConfig.parse({});

/**
 * Creates a middleware that extracts thinking events from LLM responses
 * and formats them as reasoning blocks with customizable formatting
 * @param formatConfig Optional custom formatting configuration
 */
export function parseThinkingEventsMiddleware(
  formatConfig: Partial<ReasoningFormatConfig> = {}
): LanguageModelV1Middleware {
  const config = { ...DEFAULT_REASONING_FORMAT, ...formatConfig };

  return {
    middlewareVersion: "v1",

    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      return result;
    },

    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      let isThinking = false;
      let thoughtBefore = false;

      return {
        stream: stream.pipeThrough(
          new TransformStream<
            LanguageModelV1StreamPart,
            LanguageModelV1StreamPart
          >({
            transform: (chunk, controller) => {
              // Compatible with hunyuan thinking tag
              if (chunk.type === "error") {
                const error = chunk.error as {
                  value?: { event: { type: string; name: string } };
                };
                if (
                  error.value?.event?.type === "Plugin" &&
                  error.value?.event?.name === "thinking"
                ) {
                  if (!isThinking) {
                    isThinking = true;
                    controller.enqueue({
                      type: "reasoning",
                      textDelta: thoughtBefore
                        ? config.prefixRethink
                        : config.prefix,
                    });
                    return;
                  }
                  isThinking = false;
                  thoughtBefore = true;
                  controller.enqueue({
                    type: "reasoning",
                    textDelta: config.endSuffix,
                  });
                  return;
                }
                return;
              }

              // Pass through non-text chunks
              if (chunk.type !== "text-delta") {
                controller.enqueue(chunk);
                return;
              }

              // Regular text content, pass through
              if (!isThinking) {
                controller.enqueue({
                  type: "text-delta",
                  textDelta: chunk.textDelta,
                });
                return;
              }

              // Thinking event, emit as reasoning event with proper formatting
              controller.enqueue({
                type: "reasoning",
                textDelta: chunk.textDelta.replace(/\n/g, config.linePrefix),
              });
            },
          })
        ),
        ...rest,
      };
    },
  };
}
