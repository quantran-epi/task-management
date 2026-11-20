/**
 * Safe Markdown renderer escaping raw HTML and rendering headings, bold, italics,
 * checklists, fenced code blocks, nested lists, blockquotes, GFM tables, images,
 * and links with rel="noopener noreferrer".
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Schemes allowed in links/images. Anything else (javascript:, data:, vbscript:, …) is dropped. */
const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * Strip ASCII control characters (browsers ignore them, so `java\tscript:` resolves to
 * `javascript:`) and reject any explicit scheme outside the allowlist. Relative URLs and
 * fragments carry no scheme and stay allowed.
 */
function sanitizeUrl(rawUrl: string): string | null {
  const url = rawUrl.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme && !SAFE_URL_SCHEMES.has(scheme)) return null;
  return url;
}

export function renderInlineFormatting(rawText: string): string {
  // First escape raw HTML
  let text = escapeHtml(rawText);

  // 1. Protect inline code (`code` or ``code``) before any inline formatting
  const codeTokens: string[] = [];
  text = text.replace(/(`+)([\s\S]+?)\1/g, (_match, _fence, codeContent) => {
    let cleanCode = codeContent;
    if (cleanCode.startsWith(' ') && cleanCode.endsWith(' ') && cleanCode.trim().length > 0) {
      cleanCode = cleanCode.slice(1, -1);
    }
    codeTokens.push(`<code>${cleanCode}</code>`);
    return `\x00INLINE_CODE_${codeTokens.length - 1}\x00`;
  });

  // 2. Bold (**text** or __text__)
  text = text.replace(/\*\*(?!\s)([^\n]+?)(?<!\s)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<=^|[^\w])__(?!\s)([^\n_]+?)(?<!\s)__(?=[^\w]|$)/g, '<strong>$1</strong>');

  // 3. Strikethrough (~~text~~)
  text = text.replace(/~~(?!\s)([^\n~]+?)(?<!\s)~~/g, '<del>$1</del>');

  // 4. Italic (*text* or _text_)
  text = text.replace(/\*(?!\s)([^\n*]+?)(?<!\s)\*/g, '<em>$1</em>');
  text = text.replace(/(?<=^|[^\w])_(?!\s)([^\n_]+?)(?<!\s)_(?=[^\w]|$)/g, '<em>$1</em>');

  // 4.5 Binary attachment image (![caption](attachment:uuid))
  text = text.replace(/!\[([^\]]*)\]\(attachment:([a-zA-Z0-9_-]+)\)/g, (_match, caption, uuid) => {
    return `<img class="note-attachment-image" data-attachment-id="${uuid}" alt="${caption}" />`;
  });

  // 4.5b Standard web image (![alt](url)) - disallow dangerous protocols
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
      return alt;
    }
    return `<img class="markdown-image" src="${safeUrl}" alt="${alt}" loading="lazy" />`;
  });

  // 4.6 Wiki-link chips ([[doc:id|Title]], [[task:id|Title]], [[cr:id|Title]], [[system:id|Title]])
  // Note: text was already escapeHtml'd, so '|' is intact, entity ID matches alphanumeric/dash/underscore
  text = text.replace(/\[\[(doc|task|cr|system):([a-zA-Z0-9_-]+)(?:\|([^\]]+))?\]\]/g, (_match, type, id, label) => {
    const displayLabel = label?.trim() || id;
    let icon = '📄';
    if (type === 'task') icon = '✅';
    if (type === 'cr') icon = '📋';
    if (type === 'system') icon = '🖥️';
    return `<span class="wiki-link-chip" data-entity-type="${type}" data-entity-id="${id}" role="button" tabindex="0">${icon} ${displayLabel}</span>`;
  });

  // 5. Links [text](url) - strictly disallow dangerous schemes
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
      return linkText; // Strip dangerous protocol link
    }
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
  });

  // 6. Explicit Autolinks: <https://...>
  text = text.replace(/&lt;(https?:\/\/[^&>]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  // 7. Bare URLs: Protect existing HTML tags (a, img) so URLs inside attributes aren't re-linked
  const htmlTagTokens: string[] = [];
  text = text.replace(/<(?:a\b[^>]*>.*?<\/a>|img\b[^>]*\/?>)/gs, (match) => {
    htmlTagTokens.push(match);
    return `__HTML_TAG_TOKEN_${htmlTagTokens.length - 1}__`;
  });

  text = text.replace(/\b(https?:\/\/[^\s<>"'\x00]+)/g, (_match, url) => {
    const cleanUrl = url.replace(/[.,;!?)]+$/, '');
    const trailing = url.slice(cleanUrl.length);
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
  });

  text = text.replace(/__HTML_TAG_TOKEN_(\d+)__/g, (_m, idx) => htmlTagTokens[Number(idx)] ?? '');

  // 8. Restore inline code tokens
  text = text.replace(/\x00INLINE_CODE_(\d+)\x00/g, (_m, idx) => codeTokens[Number(idx)] ?? '');

  return text;
}

/** Curated language labels accepted from a bare token line. Never taken from arbitrary text. */
const BARE_CODE_LANGUAGES = new Set([
  'java', 'javascript', 'js', 'typescript', 'ts', 'tsx', 'python', 'py', 'sql', 'json',
  'yaml', 'yml', 'bash', 'sh', 'go', 'rust', 'rs', 'c', 'cpp', 'csharp', 'html', 'css',
  'xml', 'kotlin', 'swift', 'php', 'ruby', 'scala', 'markdown', 'md', 'dockerfile',
]);

const CODE_KEYWORDS = /\b(class|def|func|function|return|const|let|var|public|private|static|void|new|import|package|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE)\b/i;

function looksLikeCodeLine(line: string): boolean {
  if (!line.trim()) return false;
  if (/^(```|#{1,6}\s|>\s?|(?:---|\*\*\*|___)\s*$)/.test(line)) return false;
  if (/^\s*(?:[-*]\s+|\d+\.\s+|\|)/.test(line)) return false;
  if (isTableDelimiter(line)) return false;
  return /[;{}()=<>:]/.test(line) || CODE_KEYWORDS.test(line);
}

/** Single source of truth for fenced AND normalized bare-token code block markup. */
function renderCodeBlockHtml(lang: string, codeLines: string[], attr: string): string {
  const escapedCode = codeLines.map((l) => escapeHtml(l)).join('\n');
  const langAttr = lang ? ` class="language-${lang}"` : '';
  const langLabel = lang || 'code';
  const diagramActionBtn =
    lang.toLowerCase() === 'mermaid'
      ? '<button class="code-diagram-btn" type="button">📊 Xem Diagram</button>'
      : '';
  return `<div class="code-block-wrapper"${attr}><div class="code-block-header"><span class="code-block-lang">${langLabel}</span><div>${diagramActionBtn}<button class="code-copy-btn" type="button">Copy</button></div></div><pre class="code-block"><code${langAttr}>${escapedCode}</code></pre></div>`;
}

function isTableDelimiter(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Matches delimiter row like |---|:---:|---:| or ---|--- or | - | - |
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(trimmed);
}

function parseTableAlignments(line: string): Array<'left' | 'center' | 'right' | null> {
  const clean = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = clean.split('|');
  return cells.map((cell) => {
    const c = cell.trim();
    const hasLeft = c.startsWith(':');
    const hasRight = c.endsWith(':');
    if (hasLeft && hasRight) return 'center';
    if (hasRight) return 'right';
    if (hasLeft) return 'left';
    return null;
  });
}

function splitTableRow(line: string): string[] {
  const placeholder = '__ESCAPED_PIPE__';
  const protectedLine = line.replace(/\\\|/g, placeholder);
  const clean = protectedLine.trim().replace(/^\|/, '').replace(/\|$/, '');
  return clean.split('|').map((c) => c.replace(new RegExp(placeholder, 'g'), '|').trim());
}

interface ListStackItem {
  type: 'ul' | 'ol';
  indent: number;
}

export interface MarkdownRenderOptions {
  sourceLines?: boolean;
}

export function renderSafeMarkdown(source: string, options?: MarkdownRenderOptions): string {
  if (!source) return '';

  const sourceLines = Boolean(options?.sourceLines);
  const lines = source.split(/\r?\n/);
  const output: string[] = [];

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];
  let codeBlockStartLine = 1;

  // Blockquote accumulator
  let blockquoteLines: string[] = [];
  let blockquoteStartLine = 1;

  // Table accumulator
  let inTable = false;
  let tableAlignments: Array<'left' | 'center' | 'right' | null> = [];
  let tableHeaderCells: string[] = [];
  let tableRows: string[][] = [];
  let tableRowLines: number[] = [];
  let tableStartLine = 1;
  let tableEndLine = 1;

  // Paragraph lines accumulator (for soft line breaks with <br />)
  let paragraphLines: string[] = [];
  let paragraphStartLine = 1;

  // List hierarchy stack and buffer
  const listStack: ListStackItem[] = [];
  let listHtmlBuffer = '';

  const lineAttr = (start: number, end: number) => {
    return sourceLines ? ` data-line-start="${start}" data-line-end="${end}"` : '';
  };

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const endLine = paragraphStartLine + paragraphLines.length - 1;
      const formatted = paragraphLines.map((l) => renderInlineFormatting(l)).join('<br />');
      output.push(`<p${lineAttr(paragraphStartLine, endLine)}>${formatted}</p>`);
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (listStack.length > 0) {
      while (listStack.length > 0) {
        const item = listStack.pop()!;
        listHtmlBuffer += `</li></${item.type}>`;
      }
      output.push(listHtmlBuffer);
      listHtmlBuffer = '';
    }
  };

  const flushBlockquote = (endLine?: number) => {
    if (blockquoteLines.length > 0) {
      const lastLine = endLine ?? blockquoteStartLine + blockquoteLines.length - 1;
      output.push(
        `<blockquote${lineAttr(blockquoteStartLine, lastLine)}>${blockquoteLines
          .map((l) => `<p>${renderInlineFormatting(l)}</p>`)
          .join('')}</blockquote>`
      );
      blockquoteLines = [];
    }
  };

  const flushTable = () => {
    if (inTable && tableHeaderCells.length > 0) {
      const theadThs = tableHeaderCells
        .map((th, idx) => {
          const align = tableAlignments[idx];
          const style = align ? ` style="text-align: ${align};"` : '';
          return `<th${style}>${renderInlineFormatting(th)}</th>`;
        })
        .join('');

      const tbodyTrs = tableRows
        .map((row, rIdx) => {
          const rowLine = tableRowLines[rIdx] ?? tableStartLine + 2 + rIdx;
          const tds = tableHeaderCells
            .map((_, idx) => {
              const cell = row[idx] ?? '';
              const align = tableAlignments[idx];
              const style = align ? ` style="text-align: ${align};"` : '';
              return `<td${style}>${renderInlineFormatting(cell)}</td>`;
            })
            .join('');
          return `<tr${lineAttr(rowLine, rowLine)}>${tds}</tr>`;
        })
        .join('');

      output.push(
        `<div class="markdown-table-wrapper"${lineAttr(tableStartLine, tableEndLine)}><table class="markdown-table"><thead><tr${lineAttr(tableStartLine, tableStartLine + 1)}>${theadThs}</tr></thead><tbody>${tbodyTrs}</tbody></table></div>`
      );

      inTable = false;
      tableAlignments = [];
      tableHeaderCells = [];
      tableRows = [];
      tableRowLines = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushBlockquote();
    flushTable();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // 1. Handle code fence (``` or ```lang)
    const codeFenceMatch = line.match(/^```([a-zA-Z0-9_-]*)/);
    if (codeFenceMatch) {
      if (inCodeBlock) {
        // Closing code block
        output.push(
          renderCodeBlockHtml(codeBlockLang, codeBlockLines, lineAttr(codeBlockStartLine, i + 1))
        );
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockLines = [];
      } else {
        // Opening code block
        flushAll();
        inCodeBlock = true;
        codeBlockStartLine = i + 1;
        codeBlockLang = codeFenceMatch[1] || '';
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 1.5 Malformed model output: a bare curated language token followed by code-looking lines.
    // Only restructures plain text; the label comes from the allowlist and code still escapes.
    const bareLang = line.trim();
    if (
      BARE_CODE_LANGUAGES.has(bareLang) &&
      i + 1 < lines.length &&
      looksLikeCodeLine(lines[i + 1] ?? '')
    ) {
      flushAll();
      const codeLines: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const candidate = lines[j] ?? '';
        if (!looksLikeCodeLine(candidate)) break;
        codeLines.push(candidate);
      }
      output.push(renderCodeBlockHtml(bareLang, codeLines, lineAttr(i + 1, j)));
      i = j - 1; // loop's i++ resumes at the first non-code line
      continue;
    }

    // 2. Horizontal rule (---, ***, ___)
    if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushAll();
      output.push(`<hr${lineAttr(i + 1, i + 1)} />`);
      continue;
    }

    // 3. Headings (# through ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      flushAll();
      const level = headingMatch[1].length;
      output.push(`<h${level}${lineAttr(i + 1, i + 1)}>${renderInlineFormatting(headingMatch[2])}</h${level}>`);
      continue;
    }

    // 4. Blockquote (> text)
    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    if (blockquoteMatch && blockquoteMatch[1] !== undefined) {
      flushParagraph();
      flushList();
      flushTable();
      if (blockquoteLines.length === 0) {
        blockquoteStartLine = i + 1;
      }
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    } else if (blockquoteLines.length > 0) {
      flushBlockquote(i);
    }

    // 5. GFM Tables
    // Look ahead to check if current line is a table header followed by a delimiter line
    if (!inTable && line.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1] ?? '')) {
      flushAll();
      inTable = true;
      tableStartLine = i + 1;
      tableEndLine = i + 2;
      tableHeaderCells = splitTableRow(line);
      tableAlignments = parseTableAlignments(lines[i + 1] ?? '');
      i++; // Skip delimiter line
      continue;
    }

    if (inTable) {
      if (line.trim().length > 0 && line.includes('|')) {
        tableRows.push(splitTableRow(line));
        tableRowLines.push(i + 1);
        tableEndLine = i + 1;
        continue;
      } else {
        flushTable();
        // Continue parsing this line if not blank
      }
    }

    // 6. List Items (ordered, unordered, task-items with indentation)
    const taskMatch = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)$/);
    const ulMatch = !taskMatch ? line.match(/^(\s*)[-*]\s+(.*)$/) : null;
    const olMatch = !taskMatch && !ulMatch ? line.match(/^(\s*)\d+\.\s+(.*)$/) : null;

    if (taskMatch || ulMatch || olMatch) {
      flushParagraph();
      flushBlockquote();
      flushTable();

      const indentStr = taskMatch?.[1] ?? ulMatch?.[1] ?? olMatch?.[1] ?? '';
      const indent = indentStr.length;
      const type: 'ul' | 'ol' = olMatch ? 'ol' : 'ul';
      const itemLine = i + 1;

      let itemContent = '';
      let isTaskItem = false;
      if (taskMatch && taskMatch[2] !== undefined && taskMatch[3] !== undefined) {
        isTaskItem = true;
        const isChecked = taskMatch[2].toLowerCase() === 'x';
        const labelText = renderInlineFormatting(taskMatch[3]);
        itemContent = `<label><input type="checkbox"${isChecked ? ' checked' : ''} disabled /> ${labelText}</label>`;
      } else if (ulMatch && ulMatch[2] !== undefined) {
        itemContent = renderInlineFormatting(ulMatch[2]);
      } else if (olMatch && olMatch[2] !== undefined) {
        itemContent = renderInlineFormatting(olMatch[2]);
      }

      const liClass = isTaskItem ? ' class="task-item"' : '';
      const liAttr = `${liClass}${lineAttr(itemLine, itemLine)}`;

      // Adjust listStack according to indent
      if (listStack.length === 0) {
        listHtmlBuffer = `<${type}><li${liAttr}>${itemContent}`;
        listStack.push({ type, indent });
      } else {
        const top = listStack[listStack.length - 1]!;
        if (indent > top.indent) {
          listHtmlBuffer += `<${type}><li${liAttr}>${itemContent}`;
          listStack.push({ type, indent });
        } else if (indent === top.indent) {
          if (top.type === type) {
            listHtmlBuffer += `</li><li${liAttr}>${itemContent}`;
          } else {
            listHtmlBuffer += `</li></${top.type}><${type}><li${liAttr}>${itemContent}`;
            top.type = type;
          }
        } else {
          // Indent decreased: pop until we find matching or lower indent
          while (listStack.length > 0 && listStack[listStack.length - 1]!.indent > indent) {
            const popped = listStack.pop()!;
            listHtmlBuffer += `</li></${popped.type}>`;
          }
          if (listStack.length > 0) {
            const currentTop = listStack[listStack.length - 1]!;
            if (currentTop.type === type) {
              listHtmlBuffer += `</li><li${liAttr}>${itemContent}`;
            } else {
              listHtmlBuffer += `</li></${currentTop.type}><${type}><li${liAttr}>${itemContent}`;
              currentTop.type = type;
            }
          } else {
            listHtmlBuffer += `<${type}><li${liAttr}>${itemContent}`;
            listStack.push({ type, indent });
          }
        }
      }
      continue;
    } else if (listStack.length > 0) {
      flushList();
    }

    // 7. Blank line
    if (!line.trim()) {
      flushAll();
      continue;
    }

    // 8. Paragraph line (accumulated for soft breaks)
    if (paragraphLines.length === 0) {
      paragraphStartLine = i + 1;
    }
    paragraphLines.push(line);
  }

  // Handle unclosed code block if stream cut off
  if (inCodeBlock && codeBlockLines.length > 0) {
    output.push(renderCodeBlockHtml(codeBlockLang, codeBlockLines, lineAttr(codeBlockStartLine, lines.length)));
  }

  flushAll();

  return output.join('\n');
}
