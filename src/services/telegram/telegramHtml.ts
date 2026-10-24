/**
 * Telegram HTML Formatting & Sanitization Utility
 *
 * Supported Telegram HTML tags:
 * <b>bold</b>, <strong>bold</strong>
 * <i>italic</i>, <em>italic</em>
 * <u>underline</u>, <ins>underline</ins>
 * <s>strikethrough</s>, <strike>strikethrough</strike>, <del>strikethrough</del>
 * <span class="tg-spoiler">spoiler</span>, <tg-spoiler>spoiler</tg-spoiler>
 * <a href="http://www.example.com/">inline URL</a>
 * <code>inline fixed-width code</code>
 * <pre>pre-formatted fixed-width code block</pre>
 * <pre><code class="language-python">pre-formatted fixed-width code block with language</code></pre>
 * <blockquote>expandable blockquote</blockquote>
 *
 * Note: Only the tags mentioned above are supported in Telegram HTML parse_mode.
 * All <, >, and & symbols that are not part of a tag MUST be entity-escaped.
 */

export function escapeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function splitTableRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

/**
 * Markdown pipe tables have no Telegram HTML equivalent; render them as an
 * aligned monospace <pre> block so schema/column answers keep their structure.
 */
function extractTables(text: string, tables: string[]): string {
  const lines = text.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]!;
    const separator = lines[i + 1];

    if (header.includes('|') && separator !== undefined && TABLE_SEPARATOR.test(separator)) {
      const rows: string[][] = [splitTableRow(header)];
      let j = i + 2;
      while (j < lines.length && lines[j]!.includes('|') && lines[j]!.trim() !== '') {
        rows.push(splitTableRow(lines[j]!));
        j++;
      }

      const cols = Math.max(...rows.map((row) => row.length));
      const widths: number[] = [];
      for (let c = 0; c < cols; c++) {
        widths[c] = Math.max(1, ...rows.map((row) => (row[c] ?? '').length));
      }

      const formatted = rows.map((row) => {
        const cells: string[] = [];
        for (let c = 0; c < cols; c++) {
          cells.push((row[c] ?? '').padEnd(widths[c]!, ' '));
        }
        return cells.join(' | ').trimEnd();
      });
      formatted.splice(1, 0, widths.map((width) => '-'.repeat(width)).join('-+-'));

      const placeholder = `@@@TGTABLE${tables.length}@@@`;
      tables.push(`<pre>${escapeHtmlEntities(formatted.join('\n'))}</pre>`);
      out.push(placeholder);
      i = j - 1;
      continue;
    }

    out.push(header);
  }

  return out.join('\n');
}

function convertBlockquotes(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let quote: string[] = [];

  const flush = () => {
    if (quote.length > 0) {
      out.push(`<blockquote>${quote.join('\n')}</blockquote>`);
      quote = [];
    }
  };

  for (const line of lines) {
    const match = line.match(/^\s*(?:&gt;|>)\s?(.*)$/);
    if (match) {
      quote.push(match[1] ?? '');
    } else {
      flush();
      out.push(line);
    }
  }
  flush();

  return out.join('\n');
}

interface EmphasisMarker {
  mark: string;
  open: string;
  close: string;
}

const EMPHASIS_MARKERS: EmphasisMarker[] = [
  { mark: '***', open: '<b><i>', close: '</i></b>' },
  { mark: '___', open: '<b><i>', close: '</i></b>' },
  { mark: '**', open: '<b>', close: '</b>' },
  { mark: '__', open: '<b>', close: '</b>' },
  { mark: '~~', open: '<s>', close: '</s>' },
  { mark: '*', open: '<i>', close: '</i>' },
  { mark: '_', open: '<i>', close: '</i>' },
];

/**
 * Inline emphasis tokenizer. Unlike single-pass regexes this supports
 * multi-line spans, nesting, and never emits cross-nested tags (Markdown
 * closers close any tags opened after their opener first).
 */
function applyEmphasis(input: string): string {
  const stack: EmphasisMarker[] = [];
  let out = '';
  let i = 0;

  const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);
  const isWord = (char: string | undefined) => char !== undefined && /[A-Za-z0-9]/.test(char);

  const closeTop = () => {
    const marker = stack.pop();
    if (marker) out += marker.close;
  };

  const closeMatch = (mark: string): boolean => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k]!.mark === mark) {
        while (stack.length - 1 > k) closeTop();
        closeTop();
        return true;
      }
    }
    return false;
  };

  while (i < input.length) {
    const char = input[i]!;

    // Generated tags are stack barriers: close open emphasis first, then reopen it
    // after the tag, so structural tags never cross-nest with emphasis spans.
    if (char === '<') {
      const end = input.indexOf('>', i);
      if (end !== -1) {
        const openEmphasis = stack.splice(0);
        for (let k = openEmphasis.length - 1; k >= 0; k--) out += openEmphasis[k]!.close;
        out += input.slice(i, end + 1);
        for (const marker of openEmphasis) {
          out += marker.open;
          stack.push(marker);
        }
        i = end + 1;
        continue;
      }
    }

    const marker = EMPHASIS_MARKERS.find((candidate) => input.startsWith(candidate.mark, i));
    if (marker) {
      const prev = i > 0 ? input[i - 1] : undefined;
      const next = input[i + marker.mark.length];
      // Underscores inside words are literal: snake_case, file_names, URLs.
      const intraword = marker.mark.startsWith('_') && isWord(prev) && isWord(next);
      const canClose = !isSpace(prev);
      const canOpen = !isSpace(next);

      if (!intraword && canClose && closeMatch(marker.mark)) {
        i += marker.mark.length;
        continue;
      }
      if (!intraword && canOpen) {
        stack.push(marker);
        out += marker.open;
        i += marker.mark.length;
        continue;
      }
      out += marker.mark;
      i += marker.mark.length;
      continue;
    }

    out += char;
    i++;
  }

  while (stack.length > 0) closeTop();

  return out;
}

/**
 * Converts standard Markdown text into Telegram-compliant HTML markup.
 * Entity escapes all dynamic content to mitigate HTML injection and parsing errors.
 */
export function markdownToTelegramHtml(markdown: string): string {
  if (!markdown) return '';

  // Step 1: Extract code blocks (fenced ```...```) to prevent formatting inside code
  // Use unique null-character safe alphanumeric markers without underscores or asterisks
  const codeBlocks: string[] = [];
  let text = markdown.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const escapedCode = escapeHtmlEntities(code.replace(/\n$/, ''));
    const langAttr = lang ? ` class="language-${escapeHtmlEntities(lang)}"` : '';
    const placeholder = `@@@TGCODEBLOCK${codeBlocks.length}@@@`;
    codeBlocks.push(`<pre><code${langAttr}>${escapedCode}</code></pre>`);
    return placeholder;
  });

  // Step 2: Extract inline code (`...`) to preserve content untouched
  // Use markers without underscores or asterisks so bold/italic regex cannot match them
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    const escaped = escapeHtmlEntities(code);
    const placeholder = `@@@TGINLINECODE${inlineCodes.length}@@@`;
    inlineCodes.push(`<code>${escaped}</code>`);
    return placeholder;
  });

  // Step 2b: Extract Markdown pipe tables (rendered as aligned monospace blocks)
  const tables: string[] = [];
  text = extractTables(text, tables);

  // Step 3: Escape HTML entities in the remaining markdown text
  text = escapeHtmlEntities(text);

  // Step 4: Markdown links [text](url) -> <a href="url">text</a>
  // Ensure url is valid/safe (http, https, tg)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|tg:\/\/[^\s)]+)\)/g, (_match, linkText, url) => {
    // A quote in the URL would end the href attribute early (or inject markup).
    return `<a href="${url.replace(/"/g, '&quot;')}">${linkText}</a>`;
  });

  // Step 5: Markdown headers (# Header -> <b>Header</b>)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Step 6: Blockquotes (> quoted lines -> <blockquote>...</blockquote>)
  text = convertBlockquotes(text);

  // Step 7: Bold / italic / strikethrough (nesting + multi-line aware)
  text = applyEmphasis(text);

  // Step 8: Re-insert tables, then inline code, then code block placeholders
  text = text.replace(/@@@TGTABLE(\d+)@@@/g, (_match, idx) => tables[Number(idx)] ?? '');

  // Step 9: Re-insert inline code placeholders
  text = text.replace(/@@@TGINLINECODE(\d+)@@@/g, (_match, idx) => {
    return inlineCodes[Number(idx)] || '';
  });

  // Step 10: Re-insert code block placeholders
  text = text.replace(/@@@TGCODEBLOCK(\d+)@@@/g, (_match, idx) => {
    return codeBlocks[Number(idx)] || '';
  });

  return text;
}
