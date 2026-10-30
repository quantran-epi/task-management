import React, { useState } from 'react';
import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  InboxOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Alert, Badge, Button, Card, Input, Popconfirm, Space, Tag, Typography, theme } from 'antd';
import type { SdlcStepId, SdlcWorkflowState } from '../../../services/wizard/workflowSchemas';
import { RevisionImpactModal } from './RevisionImpactModal';

const { Text } = Typography;

export interface SdlcWorkflowHubProps {
  projectScoped: boolean;
  state?: SdlcWorkflowState | undefined;
  onStartWorkflow: () => void;
  onSelectStep?: ((stepId: SdlcStepId) => void) | undefined;
  onNavigateStep?: ((stepId: SdlcStepId) => void) | undefined;
  onRerunStep?: ((stepId: SdlcStepId) => void) | undefined;
  onResetWorkflow?: (() => void) | undefined;
  onRequestRequirementRevision?: (() => void) | undefined;
  onRequestSolutionRevision?: (() => void) | undefined;
  revisionDraft?: string | undefined;
  onRevisionDraftChange?: ((value: string) => void) | undefined;
}

interface StepConfig {
  id: SdlcStepId;
  title: string;
  shortTitle: string;
  stepNumber: number;
  icon: React.ReactNode;
  hint: string;
}

const STEP_CONFIGS: StepConfig[] = [
  {
    id: 'INTAKE',
    title: 'Hồ sơ Đầu vào (PL01 & PL02)',
    shortTitle: '1. Đầu vào',
    stepNumber: 1,
    icon: <FileTextOutlined />,
    hint: 'Đã nạp yêu cầu PL01 và đặc tả PL02 làm căn cứ đối soát.',
  },
  {
    id: 'SOLUTION',
    title: 'Giải pháp SOLUTION.md',
    shortTitle: '2. Solution',
    stepNumber: 2,
    icon: <FileDoneOutlined />,
    hint: 'AI đối chiếu tri thức và đề xuất giải pháp. Chat bên dưới để chỉnh sửa, sau đó bấm Lưu SOLUTION.md.',
  },
  {
    id: 'CODE_GUIDE',
    title: 'Triển khai Code ngoài',
    shortTitle: '3. Coding',
    stepNumber: 3,
    icon: <CodeOutlined />,
    hint: 'Coding ngoài theo SOLUTION đã chốt. Đóng gói bằng: node scripts/change-pack.mjs --cr <MÃ_CR>',
  },
  {
    id: 'CHANGE_PACK',
    title: 'Change Pack & Soi Drift',
    shortTitle: '4. Change Pack',
    stepNumber: 4,
    icon: <InboxOutlined />,
    hint: 'Kéo thả file change-pack.zip để đối chiếu lệch giữa Code thực tế và SOLUTION.',
  },
  {
    id: 'TECH_DOCS',
    title: 'Kỹ thuật (PL03B & PL07)',
    shortTitle: '5. Kỹ thuật',
    stepNumber: 5,
    icon: <SafetyCertificateOutlined />,
    hint: 'Soát xét và duyệt tài liệu triển khai PL03B và checklist review PL07.',
  },
  {
    id: 'CAB',
    title: 'Tờ trình phê duyệt CAB',
    shortTitle: '6. Tờ trình CAB',
    stepNumber: 6,
    icon: <AuditOutlined />,
    hint: 'Tổng kết tự động toàn bộ hồ sơ trình Hội đồng Phê duyệt Thay đổi (CAB).',
  },
];

export const SdlcWorkflowHub: React.FC<SdlcWorkflowHubProps> = ({
  projectScoped,
  state,
  onStartWorkflow,
  onSelectStep,
  onNavigateStep: _onNavigateStep,
  onRerunStep,
  onResetWorkflow,
  onRequestRequirementRevision,
  onRequestSolutionRevision,
  revisionDraft: controlledRevisionDraft,
  onRevisionDraftChange,
}) => {
  const { token } = theme.useToken();
  const [localSelectedStep, setLocalSelectedStep] = useState<SdlcStepId | null>(null);
  const [revisionModalType, setRevisionModalType] = useState<'requirement' | 'solution' | null>(null);
  const [revisionDraft, setRevisionDraft] = useState('');
  const effectiveRevisionDraft = controlledRevisionDraft ?? revisionDraft;
  const updateRevisionDraft = (value: string) => {
    setRevisionDraft(value);
    onRevisionDraftChange?.(value);
  };

  if (!projectScoped) {
    return (
      <Card size="small" style={{ width: '100%', borderColor: token.colorBorderSecondary }}>
        <Text type="secondary">Chọn phạm vi Dự án để kích hoạt Quy trình SDLC Developer.</Text>
      </Card>
    );
  }

  if (!state) {
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 12px',
          background: token.colorFillAlter,
          borderRadius: token.borderRadius,
          border: `1px solid ${token.colorBorderSecondary}`,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <Space size={8} wrap style={{ flex: 1, minWidth: 200 }}>
          <Badge status="processing" />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Quy trình SDLC Developer:</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chưa khởi tạo cho dự án này.
          </Text>
        </Space>
        <Button type="primary" size="small" icon={<FileTextOutlined />} onClick={onStartWorkflow}>
          Khởi tạo SDLC (PL01 & PL02)
        </Button>
      </div>
    );
  }

  const currentProcessingStep = state.currentStep;
  const selectedStep = localSelectedStep ?? state.selectedStep ?? currentProcessingStep;

  const currentStepIndex = STEP_CONFIGS.findIndex((s) => s.id === currentProcessingStep);
  const selectedStepIndex = STEP_CONFIGS.findIndex((s) => s.id === selectedStep);
  const selectedConfig = STEP_CONFIGS[selectedStepIndex] ?? (STEP_CONFIGS[0] as StepConfig);
  const currentConfig = STEP_CONFIGS[currentStepIndex] ?? (STEP_CONFIGS[0] as StepConfig);

  const hasStale = state.staleSteps.length > 0;
  const isSelectedStale = state.staleSteps.includes(selectedStep);
  const isCurrentProcessingStale = state.staleSteps.includes(currentProcessingStep);

  const isIntakeCompleted = Boolean(state.artifacts.pl01 && state.artifacts.pl02);
  const isSolutionCompleted = Boolean(state.artifacts.solution);

  const handleStepClick = (stepId: SdlcStepId) => {
    setLocalSelectedStep(stepId);
    onSelectStep?.(stepId);
  };

  // Cycles calculation
  const cycles = state.cycles ?? [];
  const currentCycleNumber = cycles.length > 0 ? cycles.length : 1;
  const currentCycleStatus = cycles.length > 0 ? cycles[cycles.length - 1]?.status : 'active';
  const pastCycles = cycles.slice(0, -1);

  // Stale impact for revision preview
  const requirementStaleImpact: SdlcStepId[] = ['SOLUTION', 'CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB'];
  const solutionStaleImpact: SdlcStepId[] = ['CODE_GUIDE', 'CHANGE_PACK', 'TECH_DOCS', 'CAB'];

  return (
    <Card
      size="small"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        borderColor: hasStale ? token.colorWarning : token.colorBorderSecondary,
        backgroundColor: token.colorFillAlter,
      }}
      styles={{ body: { padding: '8px 12px' } }}
      title={
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <Space size={6} wrap>
            <span style={{ fontSize: 13, fontWeight: 600 }}>SDLC: {state.metadata.featureName}</span>
            <Tag color="blue">{state.metadata.cr}</Tag>
            {hasStale && (
              <Tag color="warning" icon={<ReloadOutlined />}>
                {state.staleSteps.length} bước cần cập nhật
              </Tag>
            )}
          </Space>
          <Space size={6} wrap>
            {isIntakeCompleted && (
              <Button
                size="small"
                onClick={() => {
                  if (onRequestRequirementRevision) {
                    onRequestRequirementRevision();
                  } else {
                    setRevisionModalType('requirement');
                  }
                }}
              >
                Cập nhật yêu cầu
              </Button>
            )}
            {isSolutionCompleted && (
              <Button
                size="small"
                onClick={() => {
                  if (onRequestSolutionRevision) {
                    onRequestSolutionRevision();
                  } else {
                    setRevisionModalType('solution');
                  }
                }}
              >
                Cập nhật solution
              </Button>
            )}
            <Button size="small" onClick={onStartWorkflow}>
              Sửa PL01/PL02
            </Button>
            {onResetWorkflow && (
              <Popconfirm
                title="Làm mới workflow?"
                description="Các tài liệu đã lưu trong Notes vẫn được giữ lại."
                onConfirm={onResetWorkflow}
                okText="Làm mới workflow"
                cancelText="Giữ workflow hiện tại"
              >
                <Button size="small" danger>
                  Làm mới workflow
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      }
    >
      {/* Cycle display header */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 8px',
            borderRadius: token.borderRadiusSM,
            backgroundColor: token.colorFillTertiary,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span>
            Chu kỳ {currentCycleNumber} — {currentCycleStatus === 'completed' ? 'Hoàn tất' : 'Đang thực hiện'}
          </span>
          {pastCycles.length > 0 && (
            <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
              ({pastCycles.length} chu kỳ cũ)
            </span>
          )}
        </div>

        {pastCycles.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {pastCycles.map((c, idx) => (
              <div
                key={c.cycleId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '2px 8px',
                  borderRadius: token.borderRadiusSM,
                  backgroundColor: token.colorBgContainer,
                  fontSize: 11,
                  color: token.colorTextSecondary,
                }}
              >
                <span>Chu kỳ {idx + 1} — Hoàn tất</span>
                <Tag style={{ margin: 0 }}>Chỉ đọc</Tag>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* D-16 Vertical 6-step timeline in 1 column (no horizontal overflow, wraps at 320px) */}
      <div
        role="list"
        aria-label="Quy trình 6 bước SDLC"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '2px 0 8px',
        }}
      >
        {STEP_CONFIGS.map((cfg, idx) => {
          const isSelected = cfg.id === selectedStep;
          const isProcessing = cfg.id === currentProcessingStep;
          const isStale = state.staleSteps.includes(cfg.id);
          const isDone =
            !isStale &&
            !isProcessing &&
            (idx < currentStepIndex ||
              (cfg.id === 'INTAKE' && isIntakeCompleted) ||
              (cfg.id === 'SOLUTION' && isSolutionCompleted));

          let icon = cfg.icon;
          let stateLabel = 'Chưa bắt đầu';
          let stateColor = token.colorTextQuaternary;

          if (isStale) {
            icon = <ReloadOutlined style={{ color: token.colorWarning }} />;
            stateLabel = 'Cần cập nhật';
            stateColor = token.colorWarning;
          } else if (isProcessing) {
            icon = <SyncOutlined spin style={{ color: token.colorPrimary }} />;
            stateLabel = 'Đang xử lý';
            stateColor = token.colorPrimary;
          } else if (isDone) {
            icon = <CheckCircleOutlined style={{ color: token.colorSuccess }} />;
            stateLabel = 'Đã xong';
            stateColor = token.colorSuccess;
          } else {
            icon = <ClockCircleOutlined style={{ color: token.colorTextQuaternary }} />;
            stateLabel = 'Chưa bắt đầu';
            stateColor = token.colorTextQuaternary;
          }

          const borderStyle = isSelected
            ? `1px solid ${token.colorPrimary}`
            : isStale
              ? `1px solid ${token.colorWarning}`
              : `1px solid ${token.colorBorderSecondary}`;

          const bgStyle = isSelected
            ? token.colorFillTertiary
            : token.colorBgContainer;

          return (
            <div key={cfg.id} role="listitem" style={{ width: '100%' }}>
              <button
                type="button"
                aria-label={`Bước ${cfg.stepNumber}: ${cfg.title} — ${stateLabel}`}
                aria-current={isProcessing && isSelected ? 'step' : undefined}
                aria-selected={isSelected}
                onClick={() => handleStepClick(cfg.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  minHeight: 40,
                  width: '100%',
                  padding: '6px 10px',
                  border: borderStyle,
                  borderRadius: token.borderRadiusSM,
                  backgroundColor: bgStyle,
                  color: token.colorText,
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 20,
                      height: 20,
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {icon}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: token.colorTextSecondary }}>
                      Bước {cfg.stepNumber}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 400,
                        wordBreak: 'break-word',
                        lineHeight: 1.3,
                      }}
                    >
                      {cfg.title}
                    </span>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: stateColor,
                    flexShrink: 0,
                    marginLeft: 4,
                  }}
                >
                  {stateLabel}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* D-17 Selected step detail / artifact panel */}
      <div
        style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          paddingTop: 8,
          marginTop: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {selectedStep !== currentProcessingStep && (
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
            <Text type="secondary">
              Đang xem bước {selectedStepIndex + 1} — chỉ đọc. Bước đang xử lý: {currentConfig.title}.
            </Text>
          </div>
        )}

        {/* D-25 Stale artifact read-only copy */}
        {isSelectedStale && (
          <Alert
            type="warning"
            showIcon
            message="Tài liệu cũ (stale) — chỉ đọc để đối chiếu, không dùng làm căn cứ cho bước mới."
            style={{ fontSize: 12, padding: '4px 8px' }}
          />
        )}

        {/* Current processing step hint or actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            fontSize: 12,
            color: token.colorTextSecondary,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text strong style={{ fontSize: 12, color: token.colorText }}>
              Bước {selectedStepIndex + 1}/6: {selectedConfig.title}
            </Text>
            <span style={{ marginLeft: 6 }}>— {selectedConfig.hint}</span>
          </div>

          {/* Cập nhật lại is allowed only for the current processing step when stale */}
          {selectedStep === currentProcessingStep && isCurrentProcessingStale && (
            <Button
              type="primary"
              danger
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => onRerunStep?.(currentProcessingStep)}
            >
              Cập nhật lại
            </Button>
          )}
        </div>
      </div>

      {/* Revision impact confirmation modal */}
      {revisionModalType && (
        <RevisionImpactModal
          open={Boolean(revisionModalType)}
          revisionType={revisionModalType}
          diff={{
            before:
              revisionModalType === 'requirement'
                ? state.artifacts.pl01?.content ?? 'Yêu cầu hiện tại'
                : state.artifacts.solution?.content ?? 'Solution hiện tại',
            after: effectiveRevisionDraft,
          }}
          description={<Input.TextArea value={effectiveRevisionDraft} onChange={(event) => updateRevisionDraft(event.target.value)} rows={6} placeholder="Nhập bản nội dung mới để xem trước và xác nhận." />}
          sources={
            revisionModalType === 'requirement' && state.artifacts.pl01
              ? [{ title: state.artifacts.pl01.title, shortHash: state.artifacts.pl01.hash.slice(0, 8) }]
              : revisionModalType === 'solution' && state.artifacts.solution
                ? [{ title: state.artifacts.solution.title, shortHash: state.artifacts.solution.hash.slice(0, 8) }]
                : []
          }
          staleStepIds={revisionModalType === 'requirement' ? requirementStaleImpact : solutionStaleImpact}
          onConfirm={() => {
            const stepToRerun = revisionModalType === 'requirement' ? 'INTAKE' : 'SOLUTION';
            onRerunStep?.(stepToRerun);
            setRevisionModalType(null);
          }}
          onClose={() => setRevisionModalType(null)}
        />
      )}
    </Card>
  );
};
