export const CHUNKING_POLICY_VERSION = 'v1';

export interface EvidenceChunk {
  chunkId: string;
  documentId: string;
  chunkKey: string;
  contentHash: string;
  headingPath: string[];
  chunkIndex: number;
  totalChunks: number;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

export class OversizedAtomicBlockError extends Error {
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

export function chunkMarkdownSnapshot(documentId: string, markdown: string): EvidenceChunk[] {
  const text = markdown || '';
  return [
    {
      chunkId: 'chunk-1',
      documentId,
      chunkKey: 'h1:root',
      contentHash: 'hash-chunk-1',
      headingPath: [],
      chunkIndex: 0,
      totalChunks: 1,
      startLine: 1,
      endLine: text.split('\n').length || 1,
      startOffset: 0,
      endOffset: text.length,
      text,
    },
  ];
}
