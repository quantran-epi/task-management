/**
 * Safe Markdown renderer escaping raw HTML and rendering headings, bold, italics,
 * checklists, fenced code blocks, lists, blockquotes, and links with rel="noopener noreferrer".
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

  // 5. Links [text](url) - strictly disallow dangerous schemes
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, url) => {
    const trimmedUrl = url.trim();
    if (/^(javascript|vbscript|data):/i.test(trimmedUrl)) {
      return linkText; // Strip dangerous protocol link
    }
    return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
  });

  return text;
}

export function renderSafeMarkdown(source: string): string {
  if (!source) return '';

  const lines = source.split(/\r?\n/);
  const output: string[] = [];

  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines: string[] = [];

  let currentListType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  let blockquoteLines: string[] = [];

  const flushList = () => {
    if (currentListType && listItems.length > 0) {
      const tag = currentListType;
      output.push(`<${tag}>${listItems.join('')}</${tag}>`);
      currentListType = null;
      listItems = [];
    }
  };

  const flushBlockquote = () => {
    if (blockquoteLines.length > 0) {
      output.push(`<blockquote>${blockquoteLines.map((l) => `<p>${renderInlineFormatting(l)}</p>`).join('')}</blockquote>`);
      blockquoteLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Handle code fence (``` or ```lang)
    const codeFenceMatch = line.match(/^```([a-zA-Z0-9_-]*)/);
    if (codeFenceMatch) {
      if (inCodeBlock) {
        // Closing code block
        const escapedCode = codeBlockLines.map((l) => escapeHtml(l)).join('\n');
        const langAttr = codeBlockLang ? ` class="language-${codeBlockLang}"` : '';
        output.push(`<pre class="code-block"><code${langAttr}>${escapedCode}</code></pre>`);
        inCodeBlock = false;
        codeBlockLang = '';
        codeBlockLines = [];
      } else {
        // Opening code block
        flushList();
        flushBlockquote();
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

    // Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushList();
      flushBlockquote();
      output.push('<hr />');
      continue;
    }

    // Headings (# through ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      flushList();
      flushBlockquote();
      const level = headingMatch[1].length;
      output.push(`<h${level}>${renderInlineFormatting(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote (> text)
    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    if (blockquoteMatch && blockquoteMatch[1] !== undefined) {
      flushList();
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    } else {
      flushBlockquote();
    }

    // Task list items (- [ ] or - [x])
    const taskMatch = line.match(/^-\s+\[([ xX])\]\s+(.*)$/);
    if (taskMatch && taskMatch[1] !== undefined && taskMatch[2] !== undefined) {
      if (currentListType !== 'ul') {
        flushList();
        currentListType = 'ul';
      }
      const isChecked = taskMatch[1].toLowerCase() === 'x';
      const labelText = renderInlineFormatting(taskMatch[2]);
      listItems.push(
        `<li class="task-item"><label><input type="checkbox"${isChecked ? ' checked' : ''} disabled /> ${labelText}</label></li>`
      );
      continue;
    }

    // Unordered lists (- item or * item)
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch && ulMatch[1] !== undefined) {
      if (currentListType !== 'ul') {
        flushList();
        currentListType = 'ul';
      }
      listItems.push(`<li>${renderInlineFormatting(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered lists (1. item)
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch && olMatch[1] !== undefined) {
      if (currentListType !== 'ol') {
        flushList();
        currentListType = 'ol';
      }
      listItems.push(`<li>${renderInlineFormatting(olMatch[1])}</li>`);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      flushList();
      flushBlockquote();
      continue;
    }

    // Regular paragraph text
    flushList();
    flushBlockquote();
    output.push(`<p>${renderInlineFormatting(line)}</p>`);
  }

  // Handle unclosed code block if stream cut off
  if (inCodeBlock && codeBlockLines.length > 0) {
    const escapedCode = codeBlockLines.map((l) => escapeHtml(l)).join('\n');
    const langAttr = codeBlockLang ? ` class="language-${codeBlockLang}"` : '';
    output.push(`<pre class="code-block"><code${langAttr}>${escapedCode}</code></pre>`);
  }

  flushList();
  flushBlockquote();

  return output.join('\n');
}
