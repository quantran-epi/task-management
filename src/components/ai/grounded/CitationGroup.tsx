import React from 'react';
import type { PersistedCitation } from '../../services/ai/groundedAnswerSchemas';
import { CitationChip } from '../CitationChip';

export interface CitationGroupProps {
  citations: readonly PersistedCitation[];
  onActivate: (c: PersistedCitation) => void;
}

function parseCitationNumber(citationId: string): number {
  const match = citationId.match(/[0-9]+/);
  return match ? parseInt(match[0], 10) : 1;
}

/**
 * CitationGroup renders inline deduplicated citation chips (D-11).
 * Deduplicates by citationId in natural order, wrapping CitationChip with xs (4px) gap.
 */
export const CitationGroup: React.FC<CitationGroupProps> = ({ citations, onActivate }) => {
  // Dedup by citationId preserving stable first occurrence
  const seen = new Set<string>();
  const uniqueCitations: PersistedCitation[] = [];
  for (const c of citations) {
    if (!seen.has(c.citationId)) {
      seen.add(c.citationId);
      uniqueCitations.push(c);
    }
  }

  // Sort by natural order of citationId (e.g. S1, S2, L1...)
  uniqueCitations.sort((a, b) => {
    const numA = parseCitationNumber(a.citationId);
    const numB = parseCitationNumber(b.citationId);
    if (a.authority !== b.authority) {
      return a.authority === 'server' ? -1 : 1;
    }
    return numA - numB;
  });

  return (
    <span
      className="citation-group"
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 4,
        verticalAlign: 'baseline',
      }}
    >
      {uniqueCitations.map((c) => (
        <CitationChip
          key={c.citationId}
          docId={c.documentId}
          documentTitle={c.documentTitle}
          sectionAnchor={c.sectionAnchor}
          index={parseCitationNumber(c.citationId)}
          source={c.authority}
          evidenceClass={c.evidenceClass}
          range={{ startLine: c.lineStart, endLine: c.lineEnd }}
          snapshotId={c.snapshotId ?? undefined}
          publishedContentHash={c.publishedContentHash}
          snippet={c.citedExcerpt}
          onActivate={() => onActivate(c)}
        />
      ))}
    </span>
  );
};
