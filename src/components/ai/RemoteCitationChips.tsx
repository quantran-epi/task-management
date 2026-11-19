import React from 'react';
import { Button } from 'antd';

/**
 * Phase 47 D-12: remote `path:line` citations are RENDER-ONLY chips. They are deliberately not
 * `PersistedCitation`s — that schema is a strict object tied to document grounding (authority,
 * evidenceClass, snapshotId) and must stay unchanged. A chip carries only a repo-relative path
 * plus a line; the host (AIChatDrawer) supplies the active remote target identity at click time,
 * so a model-produced citation can never navigate to a different host/repo (T-47-10).
 */
export interface RemoteCitationRef {
  relativePath: string;
  line: number;
}

/** Matches repo-relative `path:line` references inside an assistant answer text. */
const PATH_LINE_RE = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):([1-9]\d*)/g;

/**
 * Extracts bounded, unique, repo-relative `path:line` references from assistant answer text.
 * Absolute paths and `..` traversal segments are rejected: the viewer confines the path again,
 * but the chip must not advertise an out-of-repo target in the first place.
 */
export function parseRemoteCitationRefs(text: string, max: number = 20): RemoteCitationRef[] {
  const refs: RemoteCitationRef[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(PATH_LINE_RE)) {
    const relativePath = match[1];
    const line = Number(match[2]);
    if (!relativePath || !Number.isFinite(line)) continue;
    if (relativePath.startsWith('/') || relativePath.split('/').includes('..')) continue;
    const key = `${relativePath}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ relativePath, line });
    if (refs.length >= max) break;
  }
  return refs;
}

export interface RemoteCitationChipsProps {
  citations: RemoteCitationRef[];
  onActivate: (citation: RemoteCitationRef) => void;
}

export const RemoteCitationChips: React.FC<RemoteCitationChipsProps> = ({ citations, onActivate }) => {
  if (citations.length === 0) return null;
  return (
    <div data-testid="remote-citation-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 0' }}>
      {citations.map((citation) => {
        const key = `${citation.relativePath}:${citation.line}`;
        return (
          <Button
            key={key}
            type="link"
            size="small"
            data-testid="remote-citation-chip"
            title={`Open ${key} in the remote file viewer`}
            onClick={() => onActivate(citation)}
            style={{ fontSize: 11, padding: '0 4px', height: 20 }}
          >
            {key}
          </Button>
        );
      })}
    </div>
  );
};
