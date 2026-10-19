import {
  buildChunkHashInput,
  sha256Hex,
} from '../../../knowledge-server/src/indexing/chunkHashPolicy';
import {
  CHUNKING_POLICY_VERSION,
  TARGET_CHUNK_SIZE,
  HARD_ATOMIC_BLOCK_LIMIT,
  type EvidenceChunk,
} from '../../../knowledge-server/src/types/protocol';

export {
  CHUNKING_POLICY_VERSION,
  TARGET_CHUNK_SIZE,
  HARD_ATOMIC_BLOCK_LIMIT,
  type EvidenceChunk,
};

export class OversizedAtomicBlockError extends Error {
  readonly code = 'OVERSIZED_ATOMIC_BLOCK';
  readonly blockType: string;
  readonly line: number;
  readonly column: number;
  readonly limit: number;

  constructor(blockType: string, line: number, column: number, limit: number) {
    super(`Oversized atomic block: ${blockType} at line ${line}, col ${column}`);
    this.name = 'OversizedAtomicBlockError';
    this.blockType = blockType;
    this.line = line;
    this.column = column;
    this.limit = limit;
  }
}

function deterministicOccurrenceId(seed: string): string {
  const hash = sha256Hex(seed);
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = '4' + hash.slice(13, 16);
  const part4 =
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, '0') + hash.slice(18, 20);
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

interface RawSection {
  headingPath: string[];
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}

export function chunkMarkdownSnapshot(
  documentId: string,
  rawMarkdown: string,
  _options?: {
    targetChunkSize?: number | undefined;
    hardAtomicLimit?: number | undefined;
  }
): EvidenceChunk[] {
  if (rawMarkdown.length === 0) {
    return [];
  }

  interface LineInfo {
    text: string;
    lineNum: number;
    startOffset: number;
    endOffset: number;
  }

  const lines: LineInfo[] = [];
  let lineNum = 1;
  let start = 0;
  let i = 0;

  while (i < rawMarkdown.length) {
    if (rawMarkdown[i] === '\r') {
      if (i + 1 < rawMarkdown.length && rawMarkdown[i + 1] === '\n') {
        lines.push({
          text: rawMarkdown.slice(start, i),
          lineNum: lineNum++,
          startOffset: start,
          endOffset: i + 2,
        });
        i += 2;
        start = i;
      } else {
        lines.push({
          text: rawMarkdown.slice(start, i),
          lineNum: lineNum++,
          startOffset: start,
          endOffset: i + 1,
        });
        i += 1;
        start = i;
      }
    } else if (rawMarkdown[i] === '\n') {
      lines.push({
        text: rawMarkdown.slice(start, i),
        lineNum: lineNum++,
        startOffset: start,
        endOffset: i + 1,
      });
      i += 1;
      start = i;
    } else {
      i++;
    }
  }

  if (start < rawMarkdown.length) {
    lines.push({
      text: rawMarkdown.slice(start),
      lineNum: lineNum,
      startOffset: start,
      endOffset: rawMarkdown.length,
    });
  }

  const sections: RawSection[] = [];
  let inCodeFence = false;
  const headingStack = new Map<number, string>();
  let currentHeadingPath: string[] = [];
  let currentStartOffset = 0;
  let currentStartLine = 1;
  let currentEndLine = 1;
  let hasPendingSection = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line.text)) {
      inCodeFence = !inCodeFence;
    }

    if (!inCodeFence) {
      const headingMatch = line.text.match(/^(#{1,6})\s+(.*?)(?:\s+#+)?$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        const depth = headingMatch[1].length;
        const headingText = headingMatch[2].trim();

        if (depth === 1) {
          headingStack.set(1, headingText);
          if (currentHeadingPath.length === 0) {
            currentHeadingPath = [headingText];
          }
        } else if (depth === 2 || depth === 3) {
          if (hasPendingSection) {
            sections.push({
              headingPath: [...currentHeadingPath],
              startOffset: currentStartOffset,
              endOffset: line.startOffset,
              startLine: currentStartLine,
              endLine: currentEndLine,
            });
          }

          if (depth === 2) {
            headingStack.set(2, headingText);
            headingStack.delete(3);
            headingStack.delete(4);
            headingStack.delete(5);
            headingStack.delete(6);
            currentHeadingPath = [headingText];
          } else {
            headingStack.set(3, headingText);
            headingStack.delete(4);
            headingStack.delete(5);
            headingStack.delete(6);
            const parentH2 = headingStack.get(2);
            currentHeadingPath = parentH2 ? [parentH2, headingText] : [headingText];
          }

          currentStartOffset = line.startOffset;
          currentStartLine = line.lineNum;
          currentEndLine = line.lineNum;
          hasPendingSection = true;
          continue;
        }
      }
    }

    hasPendingSection = true;
    currentEndLine = line.lineNum;
  }

  if (hasPendingSection) {
    sections.push({
      headingPath: [...currentHeadingPath],
      startOffset: currentStartOffset,
      endOffset: rawMarkdown.length,
      startLine: currentStartLine,
      endLine: lines[lines.length - 1]?.lineNum ?? currentEndLine,
    });
  }

  if (sections.length === 0 && rawMarkdown.length > 0) {
    sections.push({
      headingPath: [],
      startOffset: 0,
      endOffset: rawMarkdown.length,
      startLine: 1,
      endLine: lines[lines.length - 1]?.lineNum ?? 1,
    });
  }

  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s]!;
    if (s + 1 < sections.length) {
      sec.endOffset = sections[s + 1]!.startOffset;
    } else {
      sec.endOffset = rawMarkdown.length;
    }
  }

  const chunks: EvidenceChunk[] = [];
  for (let idx = 0; idx < sections.length; idx++) {
    const sec = sections[idx]!;
    const rawContent = rawMarkdown.slice(sec.startOffset, sec.endOffset);
    const normalizedInput = buildChunkHashInput(rawContent);
    const contentHash = sha256Hex(normalizedInput);
    const chunkKey = sha256Hex(
      `${documentId}:${sec.headingPath.join('/')}:${contentHash}:${idx}`
    );
    const occurrenceSeed = `${documentId}:${idx}:${sec.startOffset}:${sec.endOffset}:${contentHash}`;
    const occurrenceId = deterministicOccurrenceId(occurrenceSeed);

    chunks.push({
      occurrenceId,
      chunkIndex: idx,
      headingPath: sec.headingPath,
      startLine: sec.startLine,
      endLine: sec.endLine,
      startOffset: sec.startOffset,
      endOffset: sec.endOffset,
      rawContent,
      contentHash,
      chunkKey,
    });
  }

  return chunks;
}
