// Single search-fold boundary. Canonical folding lives in bm25.ts; do not duplicate NFD here.
import { normalizeVietnamese } from './bm25';

export function foldForSearch(text: string): string {
  return normalizeVietnamese(text);
}

export function searchIncludes(haystack: string, needle: string): boolean {
  return foldForSearch(haystack).includes(foldForSearch(needle));
}
