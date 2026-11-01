import { stripThinkingBlocks } from '../services/ai/nineRouterClient';

/**
 * Extracts clean SOLUTION.md markdown from an AI assistant response stream or text.
 * Strips `<think>...</think>` tags and handles fenced markdown blocks or direct `# SOLUTION` content.
 */
export function extractSolutionMarkdown(rawResponse: string): string {
  if (!rawResponse) return '';
  const clean = stripThinkingBlocks(rawResponse).trim();

  // 1. Look for fenced markdown code block containing SOLUTION heading or section 1
  const fencedMatch = clean.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
  if (
    fencedMatch &&
    (fencedMatch[1]?.includes('# SOLUTION') || fencedMatch[1]?.includes('## 1.'))
  ) {
    return fencedMatch[1].trim();
  }

  // 2. Look for explicit # SOLUTION heading starting point
  const solutionIdx = clean.indexOf('# SOLUTION');
  if (solutionIdx !== -1) {
    return clean.slice(solutionIdx).trim();
  }

  // 3. Fallback: return clean stripped response
  return clean;
}
