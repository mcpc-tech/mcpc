/**
 * Format text with info color tag for Wecom message
 */
export const formatInfoText = (text: string): string => {
  return `<font color=\"info\">${text}</font>`;
};

/**
 * Format text with warning color tag for Wecom message
 * @param text The text to be formatted
 * @returns Formatted text with color tag
 */
export const formatWarningText = (text: string): string => {
  return `<font color=\"warning\">${text}</font>`;
};

/**
 * Format text with error color tag for Wecom message
 * @param text The text to be formatted
 * @returns Formatted text with color tag
 */
export const formatCommentText = (text: string): string => {
  return `<font color=\"comment\">${text}</font>`;
};

/**
 * Tagged template literal for formatting text with info color
 * @see https://qiyeweixin.apifox.cn/api-10061357
 */
export const f = {
  info: (strings: TemplateStringsArray, ...values: any[]): string => {
    const result = strings.reduce((acc, str, i) => {
      return acc + str + (values[i] || "");
    }, "");
    return formatInfoText(result);
  },
  warning: (strings: TemplateStringsArray, ...values: any[]): string => {
    const result = strings.reduce((acc, str, i) => {
      return acc + str + (values[i] || "");
    }, "");
    return formatWarningText(result);
  },
  comment: (strings: TemplateStringsArray, ...values: any[]): string => {
    const result = strings.reduce((acc, str, i) => {
      return acc + str + (values[i] || "");
    }, "");
    return formatCommentText(result);
  },
};
