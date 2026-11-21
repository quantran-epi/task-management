/**
 * Checkpoint 261118-cz2 (`browser-filereader`).
 *
 * TaskMate never reads local file CONTENT through Rust/Tauri. The only way local file content
 * enters the AI context is an EXPLICIT user action: the user re-selects the same file through a
 * browser `<input type="file">`, and this helper reads it client-side with the browser FileReader
 * API. No content is read on attachment, on turn send, or in the background.
 *
 * Content is hard-capped by size and sanitized before entering a prompt: control characters and
 * markers that could break out of the surrounding prompt block are stripped, and binary files are
 * rejected. The returned text is intended to be wrapped in a clearly delimited prompt section.
 */

export const BROWSER_FILE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB hard cap per file

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv',
  'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'sass', 'less',
  'rs', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rb', 'php', 'swift', 'kt',
  'sh', 'bash', 'zsh', 'sql', 'log', 'ini', 'conf',
]);

export interface BrowserFileReadResult {
  fileName: string;
  content: string;
  truncated: boolean;
}

export type BrowserFileReadErrorCode =
  | 'empty'
  | 'too-large'
  | 'binary-or-unsupported'
  | 'read-failed';

export class BrowserFileReadError extends Error {
  constructor(
    public readonly code: BrowserFileReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BrowserFileReadError';
  }
}

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

/**
 * Reads a browser `File` via FileReader. Injectable `Reader` keeps this unit-testable in Node.
 */
export interface ReaderLike {
  onload: ((this: any, ev: any) => any) | null;
  onerror: ((this: any, ev: any) => any) | null;
  readAsText(blob: Blob, encoding?: string): void;
}

export async function readBrowserFileText(
  file: File,
  options: { maxBytes?: number; Reader?: new () => ReaderLike } = {},
): Promise<BrowserFileReadResult> {
  const maxBytes = options.maxBytes ?? BROWSER_FILE_MAX_BYTES;
  const fileName = file.name || 'file';

  if (file.size === 0) {
    throw new BrowserFileReadError('empty', 'File is empty.');
  }
  if (file.size > maxBytes) {
    throw new BrowserFileReadError(
      'too-large',
      `File exceeds the ${Math.round(maxBytes / 1024 / 1024 * 10) / 10} MB size limit.`,
    );
  }
  if (!isBrowserTextFileName(fileName) && typeof file.type === 'string' && file.type && !file.type.startsWith('text/')) {
    throw new BrowserFileReadError('binary-or-unsupported', 'Only text files are supported.');
  }

  const ReaderCtor: new () => ReaderLike =
    options.Reader ?? (globalThis as any).FileReader;
  if (!ReaderCtor) {
    throw new BrowserFileReadError('read-failed', 'FileReader is not available.');
  }

  const content = await new Promise<string>((resolve, reject) => {
    const reader = new ReaderCtor();
    reader.onload = () => resolve(String((reader as any).result ?? ''));
    reader.onerror = () => reject(new BrowserFileReadError('read-failed', 'Could not read file.'));
    try {
      reader.readAsText(file);
    } catch (err) {
      reject(new BrowserFileReadError('read-failed', err instanceof Error ? err.message : String(err)));
    }
  });

  // NUL bytes in the decoded text indicate a binary payload even when the extension looks textual.
  if (content.includes('\u0000')) {
    throw new BrowserFileReadError('binary-or-unsupported', 'Binary content cannot be displayed as text.');
  }

  return {
    fileName,
    content: sanitizeBrowserFileText(content),
    truncated: false,
  };
}
