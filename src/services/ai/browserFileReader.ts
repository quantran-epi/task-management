/**
 * Shared text sanitizer for AI prompts.
 *
 * TaskMate never reads local file CONTENT through Rust/Tauri or a browser `input type="file"`.
 * Remote file content reaches the prompt only through SSH FS tools, which sanitize it here before
 * wrapping it in a delimited prompt section.
 */

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv',
  'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'sass', 'less',
  'rs', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rb', 'php', 'swift', 'kt',
  'sh', 'bash', 'zsh', 'sql', 'log', 'ini', 'conf',
]);

/** Sanitizes text before it is spliced into a prompt. */
export function sanitizeBrowserFileText(raw: string): string {
  return (
    raw
      // Normalize CRLF / CR to LF for stable, predictable blocks.
      .replace(/\r\n?/g, '\n')
      // Strip C0/C1 control characters except tab and newline (no NUL/ESC/injected terminals).
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      // Neutralize sequences that could impersonate a closing prompt delimiter.
      .replace(/<\/(?:referenced_files|item_context|mentioned_entities|system|file_content)>/gi, '[closed-tag]')
      .replace(/\]\(file:/gi, '](file-')
  );
}

export function isBrowserTextFileName(fileName: string): boolean {
  const clean = fileName.split('?')[0]?.split('#')[0] || '';
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1) return false;
  return TEXT_EXTENSIONS.has(clean.slice(lastDot + 1).toLowerCase());
}
