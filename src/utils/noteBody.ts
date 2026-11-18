/** Unwraps a `{ markdown, exportPayload }` JSON envelope when a Note body carries one. A Note that merely looks like JSON keeps its body untouched. */
export function readNoteMarkdown(body: string | null | undefined): string {
  if (typeof body !== 'string' || !body.startsWith('{')) return body ?? '';
  try {
    const parsed = JSON.parse(body) as { markdown?: unknown; exportPayload?: unknown };
    if (typeof parsed?.markdown === 'string' && parsed.exportPayload !== undefined) {
      return parsed.markdown;
    }
  } catch {
    // Not JSON: plain Markdown that happens to start with a brace.
  }
  return body;
}
