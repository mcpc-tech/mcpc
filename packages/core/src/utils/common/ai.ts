import { type CheerioAPI, load } from "cheerio";
export { composeMcpDepTools } from "./mcp.ts";

type ExtractVariables<S extends string> = S extends
  `${string}{${infer Var}}${infer Rest}`
  ? Var extends `${infer ActualVar}}` ? ActualVar | ExtractVariables<Rest>
  : Var | ExtractVariables<Rest>
  : never;

type PromptInput<T extends string> = Record<
  ExtractVariables<T>,
  string | number | boolean
>;

interface NativePromptOptions {
  missingVariableHandling?: "error" | "warn" | "ignore" | "empty";
}

export const p = <T extends string>(
  template: T,
  options: NativePromptOptions = {},
): (input: PromptInput<T>) => string => {
  const { missingVariableHandling = "warn" } = options;

  // Precompute variable names from the template
  const names = new Set<string>();
  const regex = /\{((\w|\.)+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    names.add(match[1]);
  }
  const required = Array.from(names) as (keyof PromptInput<T>)[];

  return (input: PromptInput<T>): string => {
    let result = template as string;

    for (const name of required) {
      const key = name as keyof typeof input;
      const value = input[key];
      const re = new RegExp(`\\{${String(name)}\\}`, "g");

      if (value !== undefined && value !== null) {
        result = result.replace(re, String(value));
      } else {
        switch (missingVariableHandling) {
          case "error":
            throw new Error(
              `Missing variable "${String(name)}" in input for template.`,
            );
          case "empty":
            result = result.replace(re, "");
            break;
          case "warn":
          case "ignore":
          default:
            // Leave placeholder unchanged
            break;
        }
      }
    }

    return result;
  };
};

export function parseTags(
  htmlString: string,
  tags: Array<string>,
): { tagToResults: Record<string, any[]>; $: CheerioAPI } {
  const $ = load(htmlString, { xml: { decodeEntities: false } });

  const tagToResults: Record<string, any[]> = {};
  for (const tag of tags) {
    const elements = $(tag);
    tagToResults[tag] = elements.toArray();
  }
  return { tagToResults, $ };
}
