import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { Root } from 'mdast';

/**
 * Parses raw Markdown text into an MDAST (Markdown Abstract Syntax Tree)
 * with precise character offsets and line/column positions.
 * Pure isomorphic function, works identically in browser and Node.js.
 */
export function parseMarkdownToAst(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.parse(markdown) as Root;
}
