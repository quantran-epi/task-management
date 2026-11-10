/**
 * Fence-aware, hierarchical section index for Markdown documents.
 *
 * IDs are derived from heading order, not heading text, so unrelated body edits and
 * duplicate titles never move them. A skipped level nests under the nearest preceding
 * shallower heading (H1 then H3 -> 1.1).
 */
export interface ArtifactSection {
  /** Dotted hierarchical id: "1", "1.1", "2.3.1". */
  id: string;
  level: number;
  title: string;
  /** Zero-based line index of the heading line. */
  start: number;
  /** Exclusive zero-based end line index (next same-or-shallower heading, or EOF). */
  end: number;
}

const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

function headingTitle(raw: string): string {
  return raw.replace(/\s+#+\s*$/, '').trim();
}

export function splitLines(markdown: string): string[] {
  return markdown.split(/\r?\n/);
}

export function buildSectionIndex(markdown: string): ArtifactSection[] {
  const lines = splitLines(markdown);
  const headings: Array<{ level: number; title: string; start: number }> = [];
  let fence: { character: string; length: number } | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const marker = line.match(FENCE);
    if (marker) {
      const run = marker[1]!;
      if (!fence) {
        fence = { character: run[0]!, length: run.length };
      } else if (run[0] === fence.character && run.length >= fence.length && !marker[2]!.trim()) {
        fence = undefined;
      }
      continue;
    }
    if (fence) continue;
    const heading = line.match(HEADING);
    if (!heading) continue;
    headings.push({ level: heading[1]!.length, title: headingTitle(heading[2]!), start: i });
  }

  const sections: ArtifactSection[] = [];
  const stack: Array<{ level: number; id: string; children: number }> = [];
  let roots = 0;

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i]!;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) stack.pop();
    const parent = stack[stack.length - 1];
    let id: string;
    if (parent) {
      parent.children += 1;
      id = `${parent.id}.${parent.children}`;
    } else {
      roots += 1;
      id = String(roots);
    }
    stack.push({ level: heading.level, id, children: 0 });
    const next = headings.slice(i + 1).find((candidate) => candidate.level <= heading.level);
    sections.push({
      id,
      level: heading.level,
      title: heading.title,
      start: heading.start,
      end: next ? next.start : lines.length,
    });
  }

  return sections;
}
