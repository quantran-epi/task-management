import React, { useState } from 'react';
import { Card, Tag, theme } from 'antd';
import { NodeIndexOutlined, CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type {
  PersistedCitation,
  PersistedConflictGroup,
  PersistedPath,
} from '../../../services/ai/groundedAnswerSchemas';
import { CitationGroup } from './CitationGroup';

export interface GraphPathCardProps {
  paths: readonly PersistedPath[];
  citations: readonly PersistedCitation[];
  conflictGroups: readonly PersistedConflictGroup[];
  onCitationActivate: (c: PersistedCitation) => void;
}

function renderHopClassificationBadge(
  cls: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED',
  token: ReturnType<typeof theme.useToken>['token']
) {
  if (cls === 'OBSERVED') {
    return (
      <Tag
        color="success"
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: '18px',
        }}
      >
        <span style={{ marginRight: 4 }}>●</span>
        OBSERVED
      </Tag>
    );
  }
  if (cls === 'BUSINESS_APPROVED') {
    return (
      <Tag
        icon={<CheckCircleOutlined />}
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: '18px',
          borderColor: token.colorPrimary,
          color: token.colorPrimary,
          background: token.colorBgContainer,
        }}
      >
        BUSINESS_APPROVED
      </Tag>
    );
  }
  return (
    <Tag
      icon={<InfoCircleOutlined />}
      style={{
        margin: 0,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: '18px',
        borderStyle: 'dashed',
        borderColor: token.colorInfo,
        color: token.colorInfo,
        background: token.colorBgContainer,
      }}
    >
      INFERRED
    </Tag>
  );
}

function resolveBackingConflictGroup(
  path: PersistedPath,
  conflictGroups: readonly PersistedConflictGroup[]
): PersistedConflictGroup | undefined {
  const pathHopCitationIds = new Set(path.hopCitationIds.flat());
  if (pathHopCitationIds.size === 0 || conflictGroups.length === 0) return undefined;

  let bestMatch: PersistedConflictGroup | undefined = undefined;
  let maxOverlap = 0;

  for (let i = 0; i < conflictGroups.length; i++) {
    const cg = conflictGroups[i];
    if (!cg) continue;
    const cgCitationIds = new Set(cg.branches.flatMap((b) => b.citationIds));
    let overlap = 0;
    for (const cid of pathHopCitationIds) {
      if (cgCitationIds.has(cid)) overlap++;
    }
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestMatch = cg;
    }
  }

  return bestMatch;
}

interface PathRowProps {
  path: PersistedPath;
  citations: readonly PersistedCitation[];
  onCitationActivate: (c: PersistedCitation) => void;
  isPrimary?: boolean;
  prefixLabel?: string;
  showVerify?: boolean;
}

const PathRow: React.FC<PathRowProps> = ({
  path,
  citations,
  onCitationActivate,
  isPrimary = false,
  prefixLabel,
  showVerify = false,
}) => {
  const { token } = theme.useToken();
  const citationMap = new Map<string, PersistedCitation>();
  for (const c of citations) {
    citationMap.set(c.citationId, c);
  }

  const hopCount = path.edgeFactKeys.length;
  const fullHopAria = path.nodeUrns.reduce((acc, urn, i) => {
    if (i === 0) return urn;
    return `${acc} -> [${path.edgeFactKeys[i - 1]}] -> ${urn}`;
  }, '');

  const firstCitationId = path.hopCitationIds[0]?.[0];
  const firstCitation = firstCitationId ? citationMap.get(firstCitationId) : undefined;

  return (
    <div
      role="group"
      aria-label={fullHopAria}
      style={{
        padding: '8px 12px',
        background: token.colorBgContainer,
        borderRadius: token.borderRadiusSM ?? 6,
        border: `1px solid ${isPrimary ? token.colorPrimaryBorder ?? token.colorPrimary : token.colorBorderSecondary}`,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {prefixLabel && (
            <Tag style={{ margin: 0, fontWeight: 600, fontSize: 11 }}>{prefixLabel}</Tag>
          )}
          {isPrimary && (
            <Tag
              color="processing"
              style={{ margin: 0, fontWeight: 600, fontSize: 11 }}
            >
              Đường chính
            </Tag>
          )}
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
            {hopCount} bước
          </span>
        </div>
        {showVerify && (
          <Tag
            role="button"
            tabIndex={0}
            onClick={() => {
              if (firstCitation) onCitationActivate(firstCitation);
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && firstCitation) {
                e.preventDefault();
                onCitationActivate(firstCitation);
              }
            }}
            style={{
              cursor: firstCitation ? 'pointer' : 'default',
              margin: 0,
              fontSize: 11,
              fontWeight: 600,
              color: token.colorError,
              borderColor: token.colorErrorBorder ?? token.colorError,
              background: token.colorErrorBg ?? token.colorBgContainer,
            }}
          >
            Verify
          </Tag>
        )}
      </div>

      {path.edgeFactKeys.map((edgeKey, i) => {
        const sourceUrn = path.nodeUrns[i] ?? '';
        const targetUrn = path.nodeUrns[i + 1] ?? '';
        const hopCls = path.hopClassifications[i] ?? 'INFERRED';
        const hopCids = path.hopCitationIds[i] ?? [];
        const hopCitations = hopCids
          .map((id) => citationMap.get(id))
          .filter((c): c is PersistedCitation => c !== undefined);

        return (
          <div
            key={`${path.pathId}-hop-${i}`}
            style={{
              paddingLeft: 8,
              borderLeft: `2px solid ${token.colorPrimary}`,
              marginBottom: i < hopCount - 1 ? 8 : 0,
            }}
          >
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: token.colorText,
                wordBreak: 'break-all',
                marginBottom: 4,
              }}
            >
              <code style={{ fontSize: 12, background: token.colorFillTertiary, padding: '2px 4px', borderRadius: 4 }}>
                {sourceUrn}
              </code>
              <span style={{ margin: '0 6px', color: token.colorPrimary, fontWeight: 600 }}>→</span>
              <span style={{ fontSize: 12, color: token.colorTextSecondary, fontStyle: 'italic', marginRight: 6 }}>
                [{edgeKey.slice(0, 12)}…]
              </span>
              <span style={{ margin: '0 6px', color: token.colorPrimary, fontWeight: 600 }}>→</span>
              <code style={{ fontSize: 12, background: token.colorFillTertiary, padding: '2px 4px', borderRadius: 4 }}>
                {targetUrn}
              </code>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {renderHopClassificationBadge(hopCls, token)}
              {hopCitations.length > 0 && (
                <CitationGroup citations={hopCitations} onActivate={onCitationActivate} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const GraphPathCard: React.FC<GraphPathCardProps> = ({
  paths,
  citations,
  conflictGroups,
  onCitationActivate,
}) => {
  const { token } = theme.useToken();
  const [showAlternatives, setShowAlternatives] = useState<Record<string, boolean>>({});

  if (!paths || paths.length === 0) return null;

  // Group paths by snapshotId (D-14: one card per snapshot; hops never cross boundaries)
  const pathsBySnapshot = new Map<string, PersistedPath[]>();
  for (const p of paths) {
    const list = pathsBySnapshot.get(p.snapshotId) ?? [];
    list.push(p);
    pathsBySnapshot.set(p.snapshotId, list);
  }

  return (
    <div className="graph-paths-container" style={{ marginTop: 12 }}>
      {Array.from(pathsBySnapshot.entries()).map(([snapshotId, snapshotPaths]) => {
        const snapLabel = snapshotId.slice(0, 7);

        // Partition paths into Variation, Conflict, and Normal buckets
        const variationPaths: { path: PersistedPath; backing: PersistedConflictGroup }[] = [];
        const conflictPaths: { path: PersistedPath; backing: PersistedConflictGroup }[] = [];
        const normalPaths: PersistedPath[] = [];

        for (const p of snapshotPaths) {
          const backing = resolveBackingConflictGroup(p, conflictGroups);
          if (!backing) {
            normalPaths.push(p);
            continue;
          }

          const dim = backing.scopeProof?.dimension ?? backing.dimension;
          const overrideRel = backing.scopeProof?.overrideRelation;

          if (dim !== 'Unknown' && (overrideRel === 'EXTENDS' || overrideRel === 'SUPPLEMENTS')) {
            variationPaths.push({ path: p, backing });
          } else {
            conflictPaths.push({ path: p, backing });
          }
        }

        // Variation grouping: determine container title
        let variationTitle = 'Khác biệt theo môi trường';
        let variationDimension = 'Environment';
        if (variationPaths.length > 0) {
          const firstBacking = variationPaths[0]?.backing;
          const dim = firstBacking?.scopeProof?.dimension ?? firstBacking?.dimension ?? 'Environment';
          variationDimension = dim;
          if (dim === 'Version') {
            variationTitle = 'Khác biệt theo phiên bản';
          } else if (dim === 'Behavior') {
            variationTitle = 'Khác biệt theo hành vi';
          }
        }

        // Normal bucket primary rule: if any path hasConflict -> no primary
        const hasNormalConflict = normalPaths.some((p) => p.hasConflict);
        // Shortest hop count wins as primary when no conflict
        let primaryNormalPath: PersistedPath | undefined = undefined;
        let alternativeNormalPaths: PersistedPath[] = [];

        if (normalPaths.length > 0) {
          if (hasNormalConflict) {
            primaryNormalPath = undefined;
            alternativeNormalPaths = normalPaths;
          } else {
            const sorted = [...normalPaths].sort(
              (a, b) => a.edgeFactKeys.length - b.edgeFactKeys.length
            );
            primaryNormalPath = sorted[0];
            alternativeNormalPaths = sorted.slice(1);
          }
        }

        const isAltExpanded = showAlternatives[snapshotId] ?? false;

        return (
          <Card
            key={snapshotId}
            size="small"
            style={{
              marginBottom: 12,
              borderRadius: token.borderRadius,
              borderColor: token.colorBorderSecondary,
              background: token.colorFillTertiary,
            }}
            styles={{
              header: { padding: '8px 12px', background: token.colorBgContainer },
              body: { padding: 12 },
            }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <NodeIndexOutlined style={{ color: token.colorPrimary }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  Bản chụp đồ thị: {snapLabel}…
                </span>
                <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                  ({snapshotPaths.length} đường dẫn)
                </span>
              </div>
            }
          >
            {/* 1. Neutral Variation Container (D-25 / D-27) */}
            {variationPaths.length > 0 && (
              <Card
                type="inner"
                size="small"
                data-testid="graph-path-variation-container"
                data-dimension={variationDimension}
                title={
                  <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>
                    {variationTitle}
                  </span>
                }
                style={{
                  marginBottom: 10,
                  borderRadius: token.borderRadiusSM,
                  borderColor: token.colorBorderSecondary,
                  background: token.colorBgContainer,
                }}
                styles={{ body: { padding: 8 } }}
              >
                {variationPaths.map(({ path, backing }, idx) => {
                  const branchLabel =
                    backing.scopeProof?.environment ??
                    backing.scopeProof?.version ??
                    `Nhánh ${idx + 1}`;
                  return (
                    <PathRow
                      key={path.pathId}
                      path={path}
                      citations={citations}
                      onCitationActivate={onCitationActivate}
                      prefixLabel={`Bối cảnh: ${branchLabel}`}
                    />
                  );
                })}
              </Card>
            )}

            {/* 2. Destructive Conflict Container (D-29) */}
            {conflictPaths.length > 0 && (
              <Card
                type="inner"
                size="small"
                role="alert"
                data-testid="graph-path-conflict-container"
                title={
                  <span style={{ fontWeight: 600, fontSize: 13, color: token.colorError }}>
                    Không có đường chính — cần xác minh
                  </span>
                }
                style={{
                  marginBottom: 10,
                  borderRadius: token.borderRadiusSM,
                  borderColor: token.colorErrorBorder ?? token.colorError,
                  background: token.colorErrorBg ?? token.colorBgContainer,
                }}
                styles={{ body: { padding: 8 } }}
              >
                {conflictPaths.map(({ path }) => (
                  <PathRow
                    key={path.pathId}
                    path={path}
                    citations={citations}
                    onCitationActivate={onCitationActivate}
                    showVerify
                  />
                ))}
              </Card>
            )}

            {/* 3. Normal Bucket Inline Paths */}
            {primaryNormalPath && (
              <PathRow
                path={primaryNormalPath}
                citations={citations}
                onCitationActivate={onCitationActivate}
                isPrimary
              />
            )}

            {hasNormalConflict &&
              alternativeNormalPaths.map((p) => (
                <PathRow
                  key={p.pathId}
                  path={p}
                  citations={citations}
                  onCitationActivate={onCitationActivate}
                />
              ))}

            {!hasNormalConflict && alternativeNormalPaths.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {!isAltExpanded ? (
                  <a
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setShowAlternatives((prev) => ({ ...prev, [snapshotId]: true }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setShowAlternatives((prev) => ({ ...prev, [snapshotId]: true }));
                      }
                    }}
                    style={{ fontSize: 12, color: token.colorPrimary, cursor: 'pointer' }}
                  >
                    Xem {alternativeNormalPaths.length} đường thay thế
                  </a>
                ) : (
                  <div>
                    {alternativeNormalPaths.map((p) => (
                      <PathRow
                        key={p.pathId}
                        path={p}
                        citations={citations}
                        onCitationActivate={onCitationActivate}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};
