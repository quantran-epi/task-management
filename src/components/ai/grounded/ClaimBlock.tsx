import React from 'react';
import { Tag, Tooltip, Alert, theme } from 'antd';
import { InfoCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type {
  GroundedClaim,
  PersistedCitation,
  PersistedConflictGroup,
} from '../../../services/ai/groundedAnswerSchemas';
import {
  claimAssertsOverride,
  computeWeakestClassification,
  ALLOWED_EVIDENCE_KINDS,
} from '../../../services/ai/evidencePack';
import { CitationGroup } from './CitationGroup';

export interface ClaimBlockProps {
  claim: GroundedClaim;
  citations: readonly PersistedCitation[];
  conflictGroups?: readonly PersistedConflictGroup[] | undefined;
  onCitationActivate: (c: PersistedCitation) => void;
}

/**
 * ClaimBlock renders one claim with inline citations, optional INFERRED badge,
 * and D-26 invalid-state gate for unverified override claims.
 */
export const ClaimBlock: React.FC<ClaimBlockProps> = ({
  claim,
  citations,
  conflictGroups = [],
  onCitationActivate,
}) => {
  const { token } = theme.useToken();

  // Resolve cited citations
  const citationMap = new Map<string, PersistedCitation>();
  for (const c of citations) {
    citationMap.set(c.citationId, c);
  }
  const resolved = claim.citationIds
    .map((id) => citationMap.get(id))
    .filter((c): c is PersistedCitation => c !== undefined);

  // D-26 invalid-state gate: runs FIRST
  if (claimAssertsOverride(claim.text)) {
    // 1. Resolve conflict group intersecting claim.citationIds
    const intersectingConflict = conflictGroups.find((cg) =>
      cg.branches.some((branch) =>
        branch.citationIds.some((cid) => claim.citationIds.includes(cid))
      )
    );

    const hasSupersedesProof =
      intersectingConflict?.scopeProof?.overrideRelation === 'SUPERSEDES';

    // 2. Check if every cited source has evidenceKind in allowed kinds
    // Note: PersistedCitation doesn't always have evidenceKind typed, but can carry it if source was packed.
    // Check if resolved citations have an allowed evidenceKind property
    const allSourcesAllowedKinds =
      resolved.length > 0 &&
      resolved.every((c) => {
        const kind = (c as unknown as { evidenceKind?: string }).evidenceKind;
        return typeof kind === 'string' && ALLOWED_EVIDENCE_KINDS.has(kind);
      });

    if (!hasSupersedesProof && !allSourcesAllowedKinds) {
      return (
        <div
          data-testid="claim-block-invalid"
          className="claim-block--invalid"
          style={{ marginBottom: 12 }}
        >
          <Alert
            type="error"
            showIcon
            message="Không thể khẳng định ghi đè — thiếu bằng chứng SUPERSEDES hoặc nguồn chính sách/phát hành/di cư"
            style={{ marginBottom: 6 }}
          />
          {resolved.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <CitationGroup citations={resolved} onActivate={onCitationActivate} />
            </div>
          )}
        </div>
      );
    }
  }

  // Determine weakest classification for DIRECT claims (D-16, D-30)
  const isDirect = claim.classification === 'DIRECT';
  const isInferred = claim.classification === 'INFERRED';
  const classifications = resolved.map((c) => c.evidenceClass);
  const weakestClass = computeWeakestClassification(classifications);

  return (
    <div
      data-testid={`claim-block-${claim.id}`}
      style={{
        marginBottom: 8,
        lineHeight: 1.5,
        fontSize: 14,
      }}
    >
      {isInferred && (
        <span
          style={{
            fontWeight: 600,
            color: token.colorInfo,
            marginRight: 4,
          }}
        >
          Suy luận:
        </span>
      )}
      <span>{claim.text}</span>{' '}
      {resolved.length > 0 && (
        <CitationGroup citations={resolved} onActivate={onCitationActivate} />
      )}
      {isInferred && (
        <Tag
          aria-label="INFERRED"
          icon={<InfoCircleOutlined />}
          style={{
            marginLeft: 6,
            borderStyle: 'dashed',
            borderColor: token.colorInfo,
            color: token.colorInfo,
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          INFERRED
        </Tag>
      )}
      {isDirect && resolved.length > 0 && (
        <Tooltip
          title={
            <div style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Phân loại bằng chứng:</div>
              {resolved.map((c) => (
                <div key={c.citationId}>
                  [{c.citationId}] {c.documentTitle}: {c.evidenceClass}
                </div>
              ))}
            </div>
          }
        >
          {weakestClass === 'BUSINESS_APPROVED' ? (
            <Tag
              aria-label="BUSINESS_APPROVED"
              icon={<CheckCircleOutlined />}
              style={{
                marginLeft: 6,
                borderColor: token.colorPrimary,
                color: token.colorSuccess,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              BUSINESS_APPROVED
            </Tag>
          ) : (
            <Tag
              aria-label={weakestClass}
              style={{
                marginLeft: 6,
                background: token.colorFillTertiary,
                borderColor: token.colorSuccess,
                color: token.colorSuccess,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: token.colorSuccess,
                  marginRight: 4,
                  verticalAlign: 'middle',
                }}
              />
              {weakestClass}
            </Tag>
          )}
        </Tooltip>
      )}
    </div>
  );
};
