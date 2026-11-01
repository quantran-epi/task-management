/**
 * SDLC artifacts are stored with a JSON envelope: `{ markdown, exportPayload }`
 * (see `artifactBody` in services/wizard/artifactRepo.ts). Every reader that renders or
 * indexes a Note body has to unwrap it, otherwise the user sees the raw JSON.
 *
 * The rule matches `parseNoteBody` in services/wizard/hubExport.ts: unwrap only when the
 * parse yields a string `markdown` AND a present `exportPayload`. A Note that merely looks
 * like JSON keeps its body untouched.
 */
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
