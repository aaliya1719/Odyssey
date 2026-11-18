const HASHTAG_PATTERN = /(?<![A-Za-z0-9_#])#([A-Za-z][A-Za-z0-9_-]*)/g;
const VALID_TAG_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const tag of value) {
    if (typeof tag !== 'string' || !VALID_TAG_PATTERN.test(tag)) continue;
    const normalized = tag.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
  }
  return tags;
}

export function extractHashtags(text: string): { cleanText: string; tags: string[] } {
  const tags: string[] = [];
  const seen = new Set<string>();
  const cleanText = text.replace(HASHTAG_PATTERN, (_, tag: string) => {
    const normalized = tag.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      tags.push(normalized);
    }
    return '';
  }).replace(/\s+/g, ' ').replace(/\s+([,.;!?])/g, '$1').trim();

  return { cleanText, tags };
}
