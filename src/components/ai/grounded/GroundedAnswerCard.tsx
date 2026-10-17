import React from 'react';
import { Card, Collapse, Tag, Tooltip, Divider, theme } from 'antd';
import {
  toGroundedAnswerDisplay,
  type ChatMessageGrounding,
  type PersistedCitation,
} from '../../../services/ai/groundedAnswerSchemas';
import { GroundedBanner } from './GroundedBanner';
import { ClaimBlock } from './ClaimBlock';
import { ScopeVariationCard } from './ScopeVariationCard';

export interface GroundedAnswerCardProps {
  grounding: ChatMessageGrounding;
  onCitationActivate: (c: PersistedCitation) => void;
  onCandidateSelect?: ((urn: string) => void) | undefined;
  onRefinementSelect?: ((refinement: string) => void) | undefined;
  onEvidenceOnlySynthesize?: (() => void) | undefined;
  onFreshLookup?: (() => void) | undefined;
  onInvalidRetry?: (() => void) | undefined;
  onAuthRepair?: (() => void) | undefined;
  onConfigRepair?: (() => void) | undefined;
  isFreshLookingUp?: boolean | undefined;

  // External slots for Plan 12 expansion panels
  pathsSlot?: React.ReactNode | undefined;
  sourcesSlot?: React.ReactNode | undefined;
  diagnosticsSlot?: React.ReactNode | undefined;
  candidatesSlot?: React.ReactNode | undefined;
  refinementsSlot?: React.ReactNode | undefined;
  resultsSlot?: React.ReactNode | undefined;
}

/**
 * GroundedAnswerCard renders the complete ChatMessageGrounding outcome family
 * with answer-first layout, inline citation flow, conflict vs scope-variation routing,
 * and secondary lookup/repair actions.
 */
export const GroundedAnswerCard: React.FC<GroundedAnswerCardProps> = ({
  grounding,
  onCitationActivate,
  onEvidenceOnlySynthesize,
  onFreshLookup: _onFreshLookup,
  onInvalidRetry,
  onAuthRepair,
  onConfigRepair,
  pathsSlot,
  sourcesSlot,
  diagnosticsSlot,
  candidatesSlot,
  refinementsSlot,
  resultsSlot,
  isFreshLookingUp: _isFreshLookingUp = false,
}) => {
  const { token } = theme.useToken();

  const renderSecondaryCta = () => null;

  // Branch on grounding.outcome (12 outcomes from ChatMessageGroundingSchema)
  switch (grounding.outcome) {
    case 'NEEDS_CLARIFICATION':
      return (
        <Card
          size="small"
          style={{
            borderColor: token.colorInfoBorder ?? token.colorInfo,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
          }}
          styles={{ body: { padding: 16 } }}
        >
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: token.colorText }}>
            Cần xác định rõ đối tượng
          </div>
          <div style={{ fontSize: 14, color: token.colorTextSecondary, marginBottom: 12 }}>
            Có nhiều thực thể cùng số hiệu. Chọn một để tiếp tục.
          </div>
          {candidatesSlot}
        </Card>
      );

    case 'NO_EVIDENCE':
      return (
        <Card
          size="small"
          style={{
            borderColor: token.colorBorderSecondary,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
          }}
          styles={{ body: { padding: 16 } }}
        >
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: token.colorText }}>
            Không tìm thấy bằng chứng trong tri thức đã xuất bản
          </div>
          <div style={{ fontSize: 14, color: token.colorTextSecondary, marginBottom: 12 }}>
            Hệ thống không tìm thấy tài liệu hoặc đường đi đồ thị phù hợp để trả lời. Không suy đoán khi chưa có yêu cầu.
          </div>
          {refinementsSlot}
        </Card>
      );

    case 'UNSUPPORTED':
      return (
        <Card
          size="small"
          style={{
            borderColor: token.colorBorderSecondary,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
          }}
          styles={{ body: { padding: 16 } }}
        >
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: token.colorText }}>
            Câu hỏi vượt phạm vi tri thức hiện có
          </div>
          <div style={{ fontSize: 14, color: token.colorTextSecondary, marginBottom: 12 }}>
            Nội dung đã lập chỉ mục chưa đủ để trả lời. Không suy đoán từ kiến thức mô hình.
          </div>
          {refinementsSlot}
        </Card>
      );

    case 'LOCAL_FALLBACK_RESULTS':
      return (
        <Card
          size="small"
          style={{
            borderColor: token.colorBorderSecondary,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
          }}
          styles={{ body: { padding: 16 } }}
        >
          <GroundedBanner variant="local" />
          {resultsSlot}
          {renderSecondaryCta()}
        </Card>
      );

    case 'MODEL_UNAVAILABLE':
      return (
        <Card
          size="small"
          style={{
            borderColor: token.colorBorderSecondary,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
          }}
          styles={{ body: { padding: 16 } }}
        >
          <GroundedBanner
            variant="model-unavailable"
            repairCta={
              onEvidenceOnlySynthesize
                ? { label: 'Tạo câu trả lời từ bằng chứng', onClick: onEvidenceOnlySynthesize }
                : undefined
            }
          />
          {sourcesSlot}
          {pathsSlot}
          {renderSecondaryCta()}
        </Card>
      );

    case 'INVALID_GROUNDED_OUTPUT':
      return (
        <Card
          size="small"
          style={{
            borderColor: token.colorErrorBorder ?? token.colorError,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
          }}
          styles={{ body: { padding: 16 } }}
        >
          <GroundedBanner
            variant="invalid-grounded-output"
            repairCta={onInvalidRetry ? { label: 'Thử lại', onClick: onInvalidRetry } : undefined}
          />
          {sourcesSlot}
          {renderSecondaryCta()}
        </Card>
      );

    case 'ERROR_AUTH':
      return (
        <GroundedBanner
          variant="auth-error"
          repairCta={onAuthRepair ? { label: 'Cài đặt', onClick: onAuthRepair } : undefined}
        />
      );

    case 'ERROR_CONFIG':
      return (
        <GroundedBanner
          variant="config-error"
          repairCta={onConfigRepair ? { label: 'Cài đặt', onClick: onConfigRepair } : undefined}
        />
      );

    case 'ERROR_INVALID_RESPONSE':
      return <GroundedBanner variant="invalid-response" />;

    case 'READY':
    case 'DEGRADED':
    case 'LOCAL_FALLBACK_SYNTHESIS':
    default: {
      const isDegraded = grounding.outcome === 'DEGRADED';
      const isLocal = grounding.outcome === 'LOCAL_FALLBACK_SYNTHESIS';
      const displayAnswer = grounding.answer ? toGroundedAnswerDisplay(grounding.answer) : null;

      // Format degraded modalities
      const degradedList: string[] = [];
      if (grounding.modalityDiagnostics) {
        if (grounding.modalityDiagnostics.fulltext.status !== 'ok') degradedList.push('Văn bản');
        if (grounding.modalityDiagnostics.vector.status !== 'ok') degradedList.push('Vector');
        if (grounding.modalityDiagnostics.graph.status !== 'ok') degradedList.push('Đồ thị');
      }

      // Conflict / Variation classification (D-25, D-27, D-29)
      const conflictBanners: React.ReactNode[] = [];
      const scopeVariations: React.ReactNode[] = [];

      if (grounding.conflicts && grounding.conflicts.length > 0) {
        for (const cg of grounding.conflicts) {
          const dimension = cg.scopeProof?.dimension ?? cg.dimension;
          const overrideRel = cg.scopeProof?.overrideRelation;

          // ScopeVariationCard condition (D-25, D-27):
          // dimension !== 'Unknown' AND (overrideRel === 'EXTENDS' || overrideRel === 'SUPPLEMENTS')
          if (
            dimension !== 'Unknown' &&
            (overrideRel === 'EXTENDS' || overrideRel === 'SUPPLEMENTS')
          ) {
            scopeVariations.push(
              <ScopeVariationCard
                key={cg.conflictId}
                conflictGroup={cg}
                citations={grounding.citations}
                onCitationActivate={onCitationActivate}
              />
            );
          } else {
            // Unresolved or unknown conflict -> destructive ConflictBanner (D-29)
            conflictBanners.push(
              <GroundedBanner
                key={cg.conflictId}
                variant="conflict"
                dimension={dimension}
              />
            );
          }
        }
      }

      const collapseItems = [
        {
          key: 'paths',
          label: `Xem đường dẫn suy luận (${grounding.paths?.length ?? 0} bước)`,
          children: pathsSlot ?? <div style={{ fontSize: 13, color: token.colorTextSecondary }}>Chưa tải đường dẫn</div>,
        },
        {
          key: 'sources',
          label: `Xem ${grounding.citations.length} nguồn`,
          children: sourcesSlot ?? <div style={{ fontSize: 13, color: token.colorTextSecondary }}>Chưa tải nguồn trích dẫn</div>,
        },
        {
          key: 'diagnostics',
          label: 'Chi tiết chẩn đoán truy xuất',
          children: diagnosticsSlot ?? <div style={{ fontSize: 13, color: token.colorTextSecondary }}>Chưa có thông tin chẩn đoán</div>,
        },
      ];

      return (
        <Card
          size="small"
          className="grounded-answer-card"
          style={{
            borderColor: token.colorBorderSecondary,
            background: token.colorBgContainer,
            borderRadius: token.borderRadius,
          }}
          styles={{ body: { padding: 16 } }}
        >
          {isLocal && <GroundedBanner variant="local" />}
          {isDegraded && (
            <GroundedBanner
              variant="degraded"
              modalities={degradedList.length > 0 ? degradedList.join(', ') : undefined}
            />
          )}

          {conflictBanners}

          {/* Section Heading: Trả lời & Confidence Badge */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: token.colorText,
              }}
            >
              Trả lời
            </div>
            {displayAnswer && (
              <Tooltip title={displayAnswer.confidenceReason}>
                <Tag
                  color={
                    displayAnswer.confidence === 'high'
                      ? 'success'
                      : displayAnswer.confidence === 'medium'
                      ? 'processing'
                      : displayAnswer.confidence === 'low'
                      ? 'warning'
                      : 'default'
                  }
                  style={{ marginRight: 0 }}
                >
                  {displayAnswer.confidence === 'high'
                    ? 'Độ tin cậy: Cao'
                    : displayAnswer.confidence === 'medium'
                    ? 'Độ tin cậy: Trung bình'
                    : displayAnswer.confidence === 'low'
                    ? 'Độ tin cậy: Thấp'
                    : 'Độ tin cậy: Chưa xác định'}
                </Tag>
              </Tooltip>
            )}
          </div>

          {/* Conclusion prose with Claims */}
          {displayAnswer ? (
            <div style={{ marginBottom: 12 }}>
              {displayAnswer.claims.length > 0 ? (
                displayAnswer.claims.map((claim) => (
                  <ClaimBlock
                    key={claim.id}
                    claim={claim}
                    citations={grounding.citations}
                    conflictGroups={grounding.conflicts ?? []}
                    onCitationActivate={onCitationActivate}
                  />
                ))
              ) : (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                  {displayAnswer.conclusion}
                </p>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 12, fontSize: 14, color: token.colorTextSecondary }}>
              Chưa có nội dung trả lời.
            </div>
          )}

          {/* Speculation / Hypotheses Block (D-10, UI-SPEC 6.4) */}
          {displayAnswer && displayAnswer.hypotheses.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Divider dashed style={{ margin: '12px 0 8px' }} />
              <div
                style={{
                  border: `1px solid ${token.colorWarningBorder ?? '#ffe58f'}`,
                  backgroundColor: token.colorWarningBg ?? '#fffbe6',
                  borderRadius: token.borderRadiusSM ?? 6,
                  padding: '10px 14px',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: token.colorWarningText ?? token.colorWarning,
                    marginBottom: 4,
                  }}
                >
                  Giả thuyết (Chưa có bằng chứng xác thực)
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: token.colorTextSecondary,
                    marginBottom: 8,
                    fontStyle: 'italic',
                  }}
                >
                  Các giả định bên dưới được tạo theo yêu cầu suy đoán và không có trích dẫn tài liệu chứng minh.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {displayAnswer.hypotheses.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        fontSize: 13,
                        color: token.colorText,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong>{h.id}:</strong> {h.text}{' '}
                      <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>
                        ({h.justification})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Scope variations rendered below answer */}
          {scopeVariations}

          {/* Unsupported parts if present (D-03) */}
          {displayAnswer && displayAnswer.unsupportedParts.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: token.colorWarningText ?? token.colorWarning,
                  marginBottom: 4,
                }}
              >
                Chưa đủ bằng chứng cho
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                {displayAnswer.unsupportedParts.map((part, idx) => (
                  <li key={idx}>{part}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Collapsible Progressive Disclosure Panels */}
          <Collapse
            size="small"
            defaultActiveKey={[]}
            items={collapseItems}
            style={{
              marginTop: 12,
              background: token.colorFillTertiary,
              border: 'none',
            }}
          />

          {renderSecondaryCta()}
        </Card>
      );
    }
  }
};
