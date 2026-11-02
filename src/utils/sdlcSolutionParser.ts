import { stripThinkingBlocks } from '../services/ai/nineRouterClient';

/** Extract the complete SOLUTION, preserving embedded code and later sections. */
export function extractSolutionMarkdown(rawResponse: string): string {
  if (!rawResponse) return '';
  const clean = stripThinkingBlocks(rawResponse).trim();
  let fence: { character: string; length: number; start: number } | undefined;
  let heading: { start: number; fence: typeof fence } | undefined;
  let end: number | undefined;
  let lastClose: number | undefined;
  let fallback: string | undefined;
  let offset = 0;

  for (const line of clean.split('\n')) {
    if (!heading && /^#\s+SOLUTION\b/i.test(line)) {
      heading = { start: offset, fence };
    }
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      const run = marker[1]!;
      if (!fence) {
        fence = { character: run[0]!, length: run.length, start: offset + line.length + 1 };
      } else if (run[0] === fence.character && run.length >= fence.length && !marker[2]!.trim()) {
        const body = clean.slice(fence.start, offset);
        if (!fallback && /^(?:#\s+SOLUTION\b|## 1\.)/im.test(body)) fallback = body.trim();
        if (heading?.fence === fence) end = offset;
        if (heading && end === undefined) lastClose = offset + line.length;
        fence = undefined;
      }
    }
    offset += line.length + 1;
  }

  if (!heading) return fallback ?? clean;
  // ponytail: only short, unstructured text after the final fence is conversational.
  // Longer or structured tails stay in the document until an explicit delimiter exists.
  if (!heading.fence && lastClose !== undefined) {
    const tail = clean.slice(lastClose).trim();
    if (tail && tail.length <= 500 && tail.split('\n').length <= 3 &&
        !/^\s*(?:#{1,6}\s|\||[-+*]\s|\d+[.)]\s|>)/m.test(tail)) {
      end = lastClose;
    }
  }
  return clean.slice(heading.start, end).trim();
}

/** Keep conversation outside the exact artifact handed to the editor. */
export function extractChatSummary(rawResponse: string): string {
  if (!rawResponse) return '';
  const clean = stripThinkingBlocks(rawResponse).trim();
  const artifact = extractSolutionMarkdown(rawResponse);
  const summary = (artifact ? clean.replace(artifact, '') : clean)
    .replace(/^ {0,3}(?:`{3,}|~{3,})[^\n]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim();

  return summary || 'Đã hoàn thành phân tích và cập nhật nội dung kiến trúc vào trình soạn thảo bên trái.';
}
