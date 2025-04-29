/**
 * Core logic to format content into a Markdown code block.
 * Attempts to pretty-print JSON if the language is 'json'.
 *
 * @param language The language identifier for the code block (e.g., 'json', 'javascript').
 * @param strings Template string array.
 * @param values Interpolated values.
 * @returns Formatted Markdown code block string.
 */
function formatCodeBlock(
  language: string,
  strings: TemplateStringsArray,
  ...values: unknown[] // Use unknown for better type safety in template values
): string {
  // Reconstruct the raw string content
  const rawContent = String.raw({ raw: strings }, ...values);
  let formattedContent = rawContent;

  if (language.toLocaleLowerCase() === "inline") {
    formattedContent = `\`${rawContent}\``;
    return formattedContent;
  }
  return `\`\`\`${language}\n${formattedContent}\n\`\`\``;
}

/**
 * Helper utility for creating Markdown code blocks using tagged template literals.
 */
export const md = {
  /**
   * Factory function to create a Markdown code block tag for any specified language.
   * Usage: md.code('python')`def hello():\n    print("Hello, ${name}")`
   * @param language The language identifier (e.g., 'python', 'bash', 'html').
   * @returns A tagged template literal function for the specified language.
   */
  code:
    (language: string) =>
    (strings: TemplateStringsArray, ...values: unknown[]): string => {
      return formatCodeBlock(language, strings, ...values);
    },
};
