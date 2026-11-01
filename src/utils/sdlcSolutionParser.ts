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

/**
 * Extracts a concise conversational chat summary from an AI assistant response that contains SOLUTION markdown.
 * Strips out the large solution code block or solution body, preserving friendly intro/outro notes.
 */
export function extractChatSummary(rawResponse: string): string {
  if (!rawResponse) return '';
  const clean = stripThinkingBlocks(rawResponse).trim();

  // 1. Remove fenced markdown code block if it contains SOLUTION heading or section 1
  let summary = clean.replace(/```(?:markdown|md)?\s*[\s\S]*?```/gi, (match) => {
    if (match.includes('# SOLUTION') || match.includes('## 1.')) {
      return '';
    }
    return match;
  }).trim();

  // 2. If # SOLUTION heading exists directly without code block, slice before it
  const solutionIdx = summary.indexOf('# SOLUTION');
  if (solutionIdx !== -1) {
    summary = summary.slice(0, solutionIdx).trim();
  }

  // 3. Clean up extra whitespace/newlines
  summary = summary.replace(/\n{3,}/g, '\n\n').trim();

  // 4. If no conversational summary left, provide standard friendly notice
  if (!summary) {
    return 'Đã hoàn thành phân tích và cập nhật nội dung kiến trúc vào trình soạn thảo bên trái.';
  }

  return summary;
}
