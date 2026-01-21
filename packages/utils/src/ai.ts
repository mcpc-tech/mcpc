// Type-level check: only extract valid variable names (word chars and dots)
type IsValidVarChar<C extends string> = C extends
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "_"
  | "." ? true
  : false;

type IsValidVarName<S extends string> = S extends "" ? false
  : S extends `${infer C}${infer Rest}`
    ? IsValidVarChar<C> extends true
      ? Rest extends "" ? true : IsValidVarName<Rest>
    : false
  : false;

type ExtractVariables<S extends string> = S extends
  `${string}{${infer Var}}${infer Rest}`
  ? (IsValidVarName<Var> extends true ? Var : never) | ExtractVariables<Rest>
  : never;

type PromptInput<T extends string> = Record<
  ExtractVariables<T>,
  string | number | boolean
>;

interface NativePromptOptions {
  missingVariableHandling?: "error" | "warn" | "ignore" | "empty";
}

/**
 * Simple prompt template function
 */
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
