import React from 'react';
import { Card, Tag, theme } from 'antd';
import type {
  PersistedCitation,
  PersistedConflictGroup,
} from '../../../services/ai/groundedAnswerSchemas';
import { CitationGroup } from './CitationGroup';

export interface ScopeVariationCardProps {
  conflictGroup: PersistedConflictGroup;
  citations: readonly PersistedCitation[];
  onCitationActivate: (c: PersistedCitation) => void;
}

/**
 * ScopeVariationCard renders neutral variation cards for proven scope variation (D-25/D-27).
 *
 * This component is NEVER the conflict banner. It renders only when scopeProof proves variation (D-25/D-27).
 * When overrideRelation is null, undefined, or dimension === 'Unknown', GroundedBanner variant="conflict"
 * is used instead (D-29).
 */
export const ScopeVariationCard: React.FC<ScopeVariationCardProps> = ({
  conflictGroup,
  citations,
  onCitationActivate,
}) => {
  const { token } = theme.useToken();

  const dimension = conflictGroup.scopeProof?.dimension ?? conflictGroup.dimension;
  let titleSuffix = 'môi trường';
  if (dimension === 'Version') {
    titleSuffix = 'phiên bản';
  } else if (dimension === 'Behavior') {
    titleSuffix = 'hành vi';
  }
  const title = `Khác biệt theo ${titleSuffix}`;

  const citationMap = new Map<string, PersistedCitation>();
  for (const c of citations) {
    citationMap.set(c.citationId, c);
  }

  const overrideRel = conflictGroup.scopeProof?.overrideRelation;

  return (
    <Card
      size="small"
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
          <Tag
            style={{
              margin: 0,
              background: token.colorFillTertiary,
              borderColor: token.colorBorderSecondary,
              color: token.colorTextSecondary,
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            {overrideRel ?? dimension}
          </Tag>
        </div>
      }
      style={{
        marginBottom: 12,
        borderRadius: token.borderRadius,
        borderColor: token.colorBorderSecondary,
        background: token.colorBgContainer,
      }}
      styles={{ body: { padding: '8px 12px' } }}
    >
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>
        {conflictGroup.branches.map((branch, index) => {
          const branchCitations = branch.citationIds
            .map((id) => citationMap.get(id))
            .filter((c): c is PersistedCitation => c !== undefined);

          const scopeEnv = conflictGroup.scopeProof?.environment;
          const scopeVer = conflictGroup.scopeProof?.version;
          const branchLabel =
            scopeEnv ?? scopeVer ?? `Nhánh ${index + 1}`;

          return (
            <div
              key={branch.factKey}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                marginBottom: index < conflictGroup.branches.length - 1 ? 6 : 0,
              }}
            >
              <Tag
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 600,
                  background: token.colorFillSecondary,
                  borderColor: token.colorBorder,
                  color: token.colorText,
                }}
              >
                {branchLabel}
              </Tag>
              <span style={{ flex: 1, color: token.colorTextSecondary }}>
                Khóa sự kiện: {branch.factKey.slice(0, 8)}…
              </span>
              {branchCitations.length > 0 && (
                <CitationGroup citations={branchCitations} onActivate={onCitationActivate} />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
