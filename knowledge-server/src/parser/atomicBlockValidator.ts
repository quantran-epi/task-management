import { HARD_ATOMIC_BLOCK_LIMIT } from '../types/protocol.js';

export interface OversizedAtomicBlockErrorDetails {
  code: 'OVERSIZED_ATOMIC_BLOCK';
  documentId: string;
  blockType: string;
  line: number;
  column: number;
  length: number;
  limit: number;
  message: string;
}

/**
 * Structured error thrown when a single atomic block (table, code, blockquote)
 * exceeds the hard atomic block limit of 50,000 characters (D-25, T-16-15).
 * Contains no raw document source or matched content (T-16-18).
 */
export class OversizedAtomicBlockError extends Error {
  public readonly code = 'OVERSIZED_ATOMIC_BLOCK' as const;
  public readonly documentId: string;
  public readonly blockType: string;
  public readonly line: number;
  public readonly column: number;
  public readonly length: number;
  public readonly limit: number;

  constructor(details: {
    documentId: string;
    blockType: string;
    line: number;
    column: number;
    length: number;
    limit?: number | undefined;
  }) {
    const limit = details.limit ?? HARD_ATOMIC_BLOCK_LIMIT;
    const message = `Khối ${details.blockType} vượt quá giới hạn an toàn ${limit.toLocaleString()} ký tự tại dòng ${details.line}. Vui lòng chia nhỏ khối trước khi xuất bản.`;
    super(message);
    this.name = 'OversizedAtomicBlockError';
    this.documentId = details.documentId;
    this.blockType = details.blockType;
    this.line = details.line;
    this.column = details.column;
    this.length = details.length;
    this.limit = limit;
    Object.setPrototypeOf(this, OversizedAtomicBlockError.prototype);
  }

  toJSON(): OversizedAtomicBlockErrorDetails {
    return {
      code: this.code,
      documentId: this.documentId,
      blockType: this.blockType,
      line: this.line,
      column: this.column,
      length: this.length,
      limit: this.limit,
      message: this.message,
    };
  }
}

export interface AstNodeLike {
  type: string;
  position?: {
    start: { line: number; column: number; offset?: number | undefined };
    end: { line: number; column: number; offset?: number | undefined };
  } | undefined;
  children?: AstNodeLike[] | undefined;
}

/**
 * Validates whether an AST node is an atomic block and whether its length
 * exceeds the 50,000 character hard limit (D-25).
 */
export function validateAtomicBlockNode(
  node: AstNodeLike,
  documentId: string,
  limit = HARD_ATOMIC_BLOCK_LIMIT
): void {
  const isAtomic =
    node.type === 'table' ||
    node.type === 'code' ||
    node.type === 'blockquote';

  if (!isAtomic) return;

  const startOffset = node.position?.start?.offset;
  const endOffset = node.position?.end?.offset;

  if (startOffset !== undefined && endOffset !== undefined) {
    const length = endOffset - startOffset;
    if (length > limit) {
      throw new OversizedAtomicBlockError({
        documentId,
        blockType: node.type,
        line: node.position?.start.line ?? 1,
        column: node.position?.start.column ?? 1,
        length,
        limit,
      });
    }
  }
}

/** Validates atomic blocks at every AST depth before chunk projection. */
export function validateAtomicBlocksRecursively(
  node: AstNodeLike,
  documentId: string,
  limit = HARD_ATOMIC_BLOCK_LIMIT
): void {
  validateAtomicBlockNode(node, documentId, limit);
  for (const child of node.children ?? []) {
    validateAtomicBlocksRecursively(child, documentId, limit);
  }
}
