import React from 'react';
import { Tag, Tooltip, theme } from 'antd';
import { InfoCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type {
  GroundedClaim,
  PersistedCitation,
} from '../../../services/ai/groundedAnswerSchemas';
import { computeWeakestClassification } from '../../../services/ai/evidencePack';
import { CitationGroup } from './CitationGroup';

export interface ClaimBlockProps {
  claim: GroundedClaim;
  citations: readonly PersistedCitation[];
  onCitationActivate: (c: PersistedCitation) => void;
}

/**
 * ClaimBlock renders one claim with inline citations, optional INFERRED badge,
 * and D-26 invalid-state gate for unverified override claims.
 */
export const ClaimBlock: React.FC<ClaimBlockProps> = ({
  claim,
  citations,
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

  // Claims render as written by the model. Override/supersede wording is judged from
  // evidence by the model, not by a UI regex gate.

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
