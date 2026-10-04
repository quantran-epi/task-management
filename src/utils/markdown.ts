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

function renderInlineFormatting(rawText: string): string {
  // First escape raw HTML
  let text = escapeHtml(rawText);

  // 1. Inline code (`code`)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 2. Bold (**text** or __text__)
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // 3. Strikethrough (~~text~~)
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 4. Italic (*text* or _text_)
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

  // 4.5 Binary attachment image (![caption](attachment:uuid))
  text = text.replace(/!\[([^\]]*)\]\(attachment:([a-zA-Z0-9_-]+)\)/g, (_match, caption, uuid) => {
    return `<img class="note-attachment-image" data-attachment-id="${uuid}" alt="${caption}" />`;
  });

  // 4.5b Standard web image (![alt](url)) - disallow dangerous protocols
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const trimmedUrl = url.trim();
    if (/^(javascript|vbscript|data):/i.test(trimmedUrl)) {
      return alt;
    }
    return `<img class="markdown-image" src="${trimmedUrl}" alt="${alt}" loading="lazy" />`;
  });

  // 4.6 Wiki-link chips ([[doc:id|Title]], [[task:id|Title]], [[project:id|Title]])
  // Note: text was already escapeHtml'd, so '|' is intact, entity ID matches alphanumeric/dash/underscore
  text = text.replace(/\[\[(doc|task|project):([a-zA-Z0-9_-]+)(?:\|([^\]]+))?\]\]/g, (_match, type, id, label) => {
    const displayLabel = label?.trim() || id;
    let icon = '📄';
    if (type === 'task') icon = '✅';
    if (type === 'project') icon = '📁';
    return `<span class="wiki-link-chip" data-entity-type="${type}" data-entity-id="${id}" role="button" tabindex="0">${icon} ${displayLabel}</span>`;
  });

  // 5. Links [text](url) - strictly disallow dangerous schemes
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, url) => {
    const trimmedUrl = url.trim();
    if (/^(javascript|vbscript|data):/i.test(trimmedUrl)) {
      return linkText; // Strip dangerous protocol link
    }
    return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
  });

  // 6. Explicit Autolinks: <https://...>
  text = text.replace(/&lt;(https?:\/\/[^&>]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  // 7. Bare URLs: Protect existing HTML tags (a, img, code) so URLs inside attributes/content aren't re-linked
  const htmlTagTokens: string[] = [];
  text = text.replace(/<(?:a\b[^>]*>.*?<\/a>|img\b[^>]*\/?>|code\b[^>]*>.*?<\/code>)/gs, (match) => {
    htmlTagTokens.push(match);
    return `__HTML_TAG_TOKEN_${htmlTagTokens.length - 1}__`;
  });

  text = text.replace(/\b(https?:\/\/[^\s<>"']+)/g, (_match, url) => {
    const cleanUrl = url.replace(/[.,;!?)]+$/, '');
    const trailing = url.slice(cleanUrl.length);
    return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
  });

  text = text.replace(/__HTML_TAG_TOKEN_(\d+)__/g, (_m, idx) => htmlTagTokens[Number(idx)] ?? '');

  return text;
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

export function renderSafeMarkdown(source: string): string {
  if (!source) return '';

  const lines = source.split(/\r?\n/);
  const output: string[] = [];

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

  // Blockquote accumulator
  let blockquoteLines: string[] = [];

  // Table accumulator
  let inTable = false;
  let tableAlignments: Array<'left' | 'center' | 'right' | null> = [];
  let tableHeaderCells: string[] = [];
  let tableRows: string[][] = [];

  // Paragraph lines accumulator (for soft line breaks with <br />)
  let paragraphLines: string[] = [];

  // List hierarchy stack and buffer
  const listStack: ListStackItem[] = [];
  let listHtmlBuffer = '';

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const formatted = paragraphLines.map((l) => renderInlineFormatting(l)).join('<br />');
      output.push(`<p>${formatted}</p>`);
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

  const flushBlockquote = () => {
    if (blockquoteLines.length > 0) {
      output.push(`<blockquote>${blockquoteLines.map((l) => `<p>${renderInlineFormatting(l)}</p>`).join('')}</blockquote>`);
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
        .map((row) => {
          const tds = tableHeaderCells
            .map((_, idx) => {
              const cell = row[idx] ?? '';
              const align = tableAlignments[idx];
              const style = align ? ` style="text-align: ${align};"` : '';
              return `<td${style}>${renderInlineFormatting(cell)}</td>`;
            })
            .join('');
          return `<tr>${tds}</tr>`;
        })
        .join('');

      output.push(
        `<div class="markdown-table-wrapper"><table class="markdown-table"><thead><tr>${theadThs}</tr></thead><tbody>${tbodyTrs}</tbody></table></div>`
      );

      inTable = false;
      tableAlignments = [];
      tableHeaderCells = [];
      tableRows = [];
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
        const escapedCode = codeBlockLines.map((l) => escapeHtml(l)).join('\n');
        const langAttr = codeBlockLang ? ` class="language-${codeBlockLang}"` : '';
        const langLabel = codeBlockLang || 'code';
        output.push(
          `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-block-lang">${langLabel}</span><button class="code-copy-btn" type="button">Copy</button></div><pre class="code-block"><code${langAttr}>${escapedCode}</code></pre></div>`
        );
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockLines = [];
      } else {
        // Opening code block
        flushAll();
        inCodeBlock = true;
        codeBlockLang = codeFenceMatch[1] || '';
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // 2. Horizontal rule (---, ***, ___)
    if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushAll();
      output.push('<hr />');
      continue;
    }

    // 3. Headings (# through ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      flushAll();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${renderInlineFormatting(headingMatch[2])}</h${level}>`);
      continue;
    }

    // 4. Blockquote (> text)
    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    if (blockquoteMatch && blockquoteMatch[1] !== undefined) {
      flushParagraph();
      flushList();
      flushTable();
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    } else if (blockquoteLines.length > 0) {
      flushBlockquote();
    }

    // 5. GFM Tables
    // Look ahead to check if current line is a table header followed by a delimiter line
    if (!inTable && line.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1] ?? '')) {
      flushAll();
      inTable = true;
      tableHeaderCells = splitTableRow(line);
      tableAlignments = parseTableAlignments(lines[i + 1] ?? '');
      i++; // Skip delimiter line
      continue;
    }

    if (inTable) {
      if (line.trim().length > 0 && line.includes('|')) {
        tableRows.push(splitTableRow(line));
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

      // Adjust listStack according to indent
      if (listStack.length === 0) {
        listHtmlBuffer = `<${type}><li${liClass}>${itemContent}`;
        listStack.push({ type, indent });
      } else {
        const top = listStack[listStack.length - 1]!;
        if (indent > top.indent) {
          listHtmlBuffer += `<${type}><li${liClass}>${itemContent}`;
          listStack.push({ type, indent });
        } else if (indent === top.indent) {
          if (top.type === type) {
            listHtmlBuffer += `</li><li${liClass}>${itemContent}`;
          } else {
            listHtmlBuffer += `</li></${top.type}><${type}><li${liClass}>${itemContent}`;
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
              listHtmlBuffer += `</li><li${liClass}>${itemContent}`;
            } else {
              listHtmlBuffer += `</li></${currentTop.type}><${type}><li${liClass}>${itemContent}`;
              currentTop.type = type;
            }
          } else {
            listHtmlBuffer += `<${type}><li${liClass}>${itemContent}`;
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
    paragraphLines.push(line);
  }

  // Handle unclosed code block if stream cut off
  if (inCodeBlock && codeBlockLines.length > 0) {
    const escapedCode = codeBlockLines.map((l) => escapeHtml(l)).join('\n');
    const langAttr = codeBlockLang ? ` class="language-${codeBlockLang}"` : '';
    const langLabel = codeBlockLang || 'code';
    output.push(
      `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-block-lang">${langLabel}</span><button class="code-copy-btn" type="button">Copy</button></div><pre class="code-block"><code${langAttr}>${escapedCode}</code></pre></div>`
    );
  }

  flushAll();

  return output.join('\n');
}
