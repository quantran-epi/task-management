import { toString } from 'mdast-util-to-string';
import type { Root, RootContent, Heading } from 'mdast';
import { parseMarkdownToAst } from './markdownAst.js';
import {
  validateAtomicBlockNode,
  OversizedAtomicBlockError,
} from './atomicBlockValidator.js';
import {
  buildChunkHashInput,
  sha256Hex,
} from '../indexing/chunkHashPolicy.js';
import {
  TARGET_CHUNK_SIZE,
  HARD_ATOMIC_BLOCK_LIMIT,
  type EvidenceChunk,
} from '../types/protocol.js';

export { OversizedAtomicBlockError };

/**
 * Pure deterministic UUID v4 generator for occurrence IDs.
 * Generates valid UUID v4 string from high-entropy hash seed
 * without requiring external uuid library or random side-effects.
 */
function deterministicOccurrenceId(seed: string): string {
  const hash = sha256Hex(seed);
  // Format as 8-4-4-4-12 UUID v4
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = '4' + hash.slice(13, 16); // version 4
  const part4 = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.slice(18, 20); // variant 10
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

interface SectionAccumulator {
  headingPath: string[];
  nodes: RootContent[];
  startOffset: number;
  endOffset: number;
  startLine: number;
}

/**
 * Splits an oversized section (accumulated AST nodes) into sub-chunks
 * targeting TARGET_CHUNK_SIZE (6,000 characters), splitting ONLY between
 * top-level AST node boundaries per D-25.
 * Tables, code fences, blockquotes remain intact and atomic.
 */
function splitOversizedSection(
  acc: SectionAccumulator,
  targetSize: number
): SectionAccumulator[] {
  if (acc.nodes.length <= 1) {
    return [acc];
  }

  const result: SectionAccumulator[] = [];
  let currentNodes: RootContent[] = [];
  let currentStartOffset = acc.startOffset;
  let currentStartLine = acc.startLine;

  for (const node of acc.nodes) {
    const nodeStart = node.position?.start?.offset ?? currentStartOffset;
    const nodeEnd = node.position?.end?.offset ?? nodeStart;

    const projectedLength = nodeEnd - currentStartOffset;

    // Never split if currentNodes only contains headings (heading must stay with first content node)
    const hasOnlyHeadings = currentNodes.every((n) => n.type === 'heading');

    if (currentNodes.length > 0 && !hasOnlyHeadings && projectedLength > targetSize) {
      // Flush current bucket
      const lastNode = currentNodes[currentNodes.length - 1];
      result.push({
        headingPath: [...acc.headingPath],
        nodes: currentNodes,
        startOffset: currentStartOffset,
        endOffset: lastNode?.position?.end?.offset ?? nodeStart,
        startLine: currentStartLine,
      });
      currentNodes = [node];
      currentStartOffset = nodeStart;
      currentStartLine = node.position?.start?.line ?? currentStartLine;
    } else {
      currentNodes.push(node);
    }
  }

  if (currentNodes.length > 0) {
    const lastNode = currentNodes[currentNodes.length - 1];
    result.push({
      headingPath: [...acc.headingPath],
      nodes: currentNodes,
      startOffset: currentStartOffset,
      endOffset: lastNode?.position?.end?.offset ?? acc.endOffset,
      startLine: currentStartLine,
    });
  }

  return result;
}

/**
 * Lossless isomorphic section-first AST chunker implementing D-20 through D-26.
 *
 * Guarantees:
 * 1. Preamble/H2/H3/H4-H6 behavior follows D-20; no-H2/H3 documents use synthetic sections (D-21).
 * 2. Exact raw source slices and UTF-16 offsets: source.slice(startOffset, endOffset) === rawContent (D-23).
 * 3. Atomic blocks (tables, code, quotes) never split or truncate; oversized blocks (>50,000) reject with OversizedAtomicBlockError (D-25).
 * 4. Normalizes CRLF/CR to LF for contentHash computation only (D-22).
 * 5. Occurrence identity is distinct from reusable contentHash (D-24).
 * 6. Pure isomorphic execution in browser and Node without network/DOM/node: dependencies.
 */
export function chunkMarkdownSnapshot(
  documentId: string,
  rawMarkdown: string,
  options?: {
    targetChunkSize?: number | undefined;
    hardAtomicLimit?: number | undefined;
  }
): EvidenceChunk[] {
  const targetSize = options?.targetChunkSize ?? TARGET_CHUNK_SIZE;
  const hardLimit = options?.hardAtomicLimit ?? HARD_ATOMIC_BLOCK_LIMIT;

  if (rawMarkdown.length === 0) {
    return [];
  }

  const ast: Root = parseMarkdownToAst(rawMarkdown);

  // Validate all atomic nodes first across entire AST (D-25, T-16-15)
  for (const node of ast.children) {
    validateAtomicBlockNode(node, documentId, hardLimit);
  }

  // Group top-level AST nodes into semantic sections (preamble, H2, H3)
  const sections: SectionAccumulator[] = [];
  let currentNodes: RootContent[] = [];
  let currentHeadingPath: string[] = [];
  let currentStartOffset = 0;
  let currentStartLine = 1;

  const headingStack = new Map<number, string>();

  for (const node of ast.children) {
    if (node.type === 'heading') {
      const headingNode = node as Heading;
      const headingText = toString(headingNode).trim();

      if (headingNode.depth === 1) {
        headingStack.set(1, headingText);
        // H1 contributes to preamble heading path
        if (currentHeadingPath.length === 0) {
          currentHeadingPath = [headingText];
        }
        currentNodes.push(node);
      } else if (headingNode.depth === 2 || headingNode.depth === 3) {
        // Section boundary! Flush previous accumulator
        if (currentNodes.length > 0) {
          const last = currentNodes[currentNodes.length - 1];
          const nodeStart = headingNode.position?.start?.offset ?? (last?.position?.end?.offset ?? currentStartOffset);
          sections.push({
            headingPath: [...currentHeadingPath],
            nodes: currentNodes,
            startOffset: currentStartOffset,
            endOffset: nodeStart,
            startLine: currentStartLine,
          });
          currentNodes = [];
        }

        if (headingNode.depth === 2) {
          headingStack.set(2, headingText);
          headingStack.delete(3);
          headingStack.delete(4);
          headingStack.delete(5);
          headingStack.delete(6);
          currentHeadingPath = [headingText];
        } else {
          // Depth 3
          headingStack.set(3, headingText);
          headingStack.delete(4);
          headingStack.delete(5);
          headingStack.delete(6);
          const parentH2 = headingStack.get(2);
          currentHeadingPath = parentH2
            ? [parentH2, headingText]
            : [headingText];
        }

        currentStartOffset = headingNode.position?.start?.offset ?? 0;
        currentStartLine = headingNode.position?.start?.line ?? 1;
        currentNodes.push(node);
      } else {
        // H4 - H6: Updates heading path context within current section, but does NOT split section
        headingStack.set(headingNode.depth, headingText);
        for (let d = headingNode.depth + 1; d <= 6; d++) {
          headingStack.delete(d);
        }
        currentNodes.push(node);
      }
    } else {
      currentNodes.push(node);
    }
  }

  if (currentNodes.length > 0) {
    sections.push({
      headingPath: [...currentHeadingPath],
      nodes: currentNodes,
      startOffset: currentStartOffset,
      endOffset: rawMarkdown.length,
      startLine: currentStartLine,
    });
  }

  // Handle heading-less documents (D-21): single synthetic section
  if (sections.length === 0 && rawMarkdown.length > 0) {
    sections.push({
      headingPath: [],
      nodes: ast.children,
      startOffset: 0,
      endOffset: rawMarkdown.length,
      startLine: 1,
    });
  }

  // Fix up endOffset of each section to be exact startOffset of next section (lossless partition)
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]!;
    if (i + 1 < sections.length) {
      sec.endOffset = sections[i + 1]!.startOffset;
    } else {
      sec.endOffset = rawMarkdown.length;
    }
  }

  // Now process sections: if any section exceeds target size and has multiple AST blocks,
  // split between AST boundaries per D-25
  const finalSections: SectionAccumulator[] = [];
  for (const section of sections) {
    const sectionLength = section.endOffset - section.startOffset;

    if (sectionLength > targetSize && section.nodes.length > 1) {
      const subSections = splitOversizedSection(section, targetSize);
      finalSections.push(...subSections);
    } else {
      finalSections.push(section);
    }
  }

  // Fix up partition boundary continuity across sub-sections
  for (let i = 0; i < finalSections.length; i++) {
    const sec = finalSections[i]!;
    if (i + 1 < finalSections.length) {
      sec.endOffset = finalSections[i + 1]!.startOffset;
    } else {
      sec.endOffset = rawMarkdown.length;
    }
  }

  // Build final EvidenceChunk descriptors with exact source offsets and slices
  const chunks: EvidenceChunk[] = [];

  for (let i = 0; i < finalSections.length; i++) {
    const sec = finalSections[i]!;
    const lastNode = sec.nodes[sec.nodes.length - 1];

    const startOffset = sec.startOffset;
    const endOffset = sec.endOffset;

    const startLine = sec.startLine;
    const endLine = lastNode?.position?.end?.line ?? startLine;

    // Lossless exact slice of original raw markdown
    const rawContent = rawMarkdown.slice(startOffset, endOffset);
    // D-22: Content hash normalizes newlines only
    // D-24: Only normalized content hash defines content identity; exact offsets define occurrence
    const normalizedInput = buildChunkHashInput(rawContent);
    const contentHash = sha256Hex(normalizedInput);

    // chunkKey combines documentId + contentHash + headingPath for predictable server keying
    const chunkKey = sha256Hex(`${documentId}:${sec.headingPath.join('/')}:${contentHash}:${i}`);

    // occurrenceId is distinct UUID per occurrence (D-24)
    const occurrenceSeed = `${documentId}:${i}:${startOffset}:${endOffset}:${contentHash}`;
    const occurrenceId = deterministicOccurrenceId(occurrenceSeed);

    chunks.push({
      occurrenceId,
      chunkIndex: i,
      headingPath: sec.headingPath,
      startLine,
      endLine,
      startOffset,
      endOffset,
      rawContent,
      contentHash,
      chunkKey,
    });
  }

  return chunks;
}
