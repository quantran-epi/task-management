/**
 * Safe Markdown renderer escaping raw HTML and rendering headings, bold, italics,
 * checklists, code, and links with rel="noopener noreferrer" (D-16, T-13.1-07).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderSafeMarkdown(source: string): string {
  if (!source) return '';

  const lines = source.split(/\r?\n/);
  const renderedLines: string[] = [];

  for (const rawLine of lines) {
    // 1. First escape all raw HTML characters to neutralize scripts and dangerous tags
    let line = escapeHtml(rawLine);

    // 2. Headings (#, ##, ###, ####, #####, ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      const level = headingMatch[1].length;
      renderedLines.push(`<h${level}>${headingMatch[2]}</h${level}>`);
      continue;
    }

    // 3. Task checklists (- [ ] or - [x])
    if (/^-\s+\[\s*\]\s+(.*)$/.test(line)) {
      line = line.replace(
        /^-\s+\[\s*\]\s+(.*)$/,
        '<label><input type="checkbox" disabled /> $1</label>'
      );
      renderedLines.push(line);
      continue;
    }
    if (/^-\s+\[[xX]\]\s+(.*)$/.test(line)) {
      line = line.replace(
        /^-\s+\[[xX]\]\s+(.*)$/,
        '<label><input type="checkbox" checked disabled /> $1</label>'
      );
      renderedLines.push(line);
      continue;
    }

    // 4. Inline code (`code`)
    line = line.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 5. Bold (**text**) & Italic (*text*)
    line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 6. Markdown links [text](url) - strictly disallow javascript: or vbscript:
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
      const trimmedUrl = url.trim();
      if (/^(javascript|vbscript|data):/i.test(trimmedUrl)) {
        return text; // Strip dangerous protocol link
      }
      return `<a href="${trimmedUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    renderedLines.push(line);
  }

  return renderedLines.join('\n');
}
