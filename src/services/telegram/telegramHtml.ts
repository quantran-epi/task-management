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

  // Step 3: Escape HTML entities in the remaining markdown text
  text = escapeHtmlEntities(text);

  // Step 4: Markdown links [text](url) -> <a href="url">text</a>
  // Ensure url is valid/safe (http, https, tg)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|tg:\/\/[^\s)]+)\)/g, (_match, linkText, url) => {
    return `<a href="${url}">${linkText}</a>`;
  });

  // Step 5: Bold (**text** or __text__)
  text = text.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__([^_\n]+?)__/g, '<b>$1</b>');

  // Step 6: Italic (*text* or _text_)
  // Be careful with single underscore in words: match non-word boundaries or space-adjacent
  text = text.replace(/(^|[^\w*])\*([^*\n]+?)\*([^\w*]|$)/g, '$1<i>$2</i>$3');
  text = text.replace(/(^|[^\w_])_([^_\n]+?)_([^\w_]|$)/g, '$1<i>$2</i>$3');

  // Step 7: Strikethrough (~~text~~)
  text = text.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');

  // Step 8: Markdown headers (# Header -> <b>Header</b>)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

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
