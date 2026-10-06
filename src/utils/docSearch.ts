import { normalizeVietnamese } from './bm25';

export interface DocSearchFields {
  title?: string | null | undefined;
  body?: string | null | undefined;
  tags?: string[] | null | undefined;
  extraTexts?: string[] | null | undefined;
}

/**
 * Checks whether a document matches a multi-word search query.
 * Splits query by whitespace into words, requires all words to match (AND logic),
 * order-independent, case-insensitive, and Vietnamese diacritic-insensitive.
 */
export function matchesDocSearch(
  query: string,
  doc: DocSearchFields,
  additionalTexts?: string[] | null | undefined
): boolean {
  if (!query) return true;
  const trimmed = query.trim();
  if (!trimmed) return true;

  // Split query into individual words
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  // Collect raw text parts
  const rawParts: string[] = [];
  if (doc.title) rawParts.push(doc.title);
  if (doc.body) rawParts.push(doc.body);
  if (doc.tags && Array.isArray(doc.tags)) {
    rawParts.push(...doc.tags);
  }
  if (doc.extraTexts && Array.isArray(doc.extraTexts)) {
    rawParts.push(...doc.extraTexts);
  }
  if (additionalTexts && Array.isArray(additionalTexts)) {
    rawParts.push(...additionalTexts);
  }

  const rawText = rawParts.join(' ').toLowerCase();
  const normalizedText = normalizeVietnamese(rawText);

  // Every query word must match either raw (case-insensitive) or normalized (diacritic-insensitive)
  return words.every((word) => {
    if (rawText.includes(word)) return true;
    const normWord = normalizeVietnamese(word);
    return normWord.length > 0 && normalizedText.includes(normWord);
  });
}
