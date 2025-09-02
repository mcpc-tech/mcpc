import { type CheerioAPI, load } from "cheerio";

/**
 * Parse HTML tags from string
 */
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
