import React from 'react';
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
import { Badge, Button, Card, Popconfirm, Space, Tag, Typography, theme } from 'antd';
import type { SdlcStepId, SdlcWorkflowState } from '../../../services/wizard/workflowSchemas';

const { Text } = Typography;

export interface SdlcWorkflowHubProps {
  projectScoped: boolean;
  state?: SdlcWorkflowState | undefined;
  onStartWorkflow: () => void;
  onNavigateStep?: ((stepId: SdlcStepId) => void) | undefined;
  onRerunStep?: ((stepId: SdlcStepId) => void) | undefined;
  onResetWorkflow?: (() => void) | undefined;
}

interface StepConfig {
  id: SdlcStepId;
  title: string;
  shortTitle: string;
  icon: React.ReactNode;
  hint: string;
}

const STEP_CONFIGS: StepConfig[] = [
  {
    id: 'INTAKE',
    title: 'Hồ sơ Đầu vào (PL01 & PL02)',
    shortTitle: '1. Đầu vào',
    icon: <FileTextOutlined />,
    hint: 'Đã nạp yêu cầu PL01 và đặc tả PL02 làm căn cứ đối soát.',
  },
  {
    id: 'SOLUTION',
    title: 'Giải pháp SOLUTION.md',
    shortTitle: '2. Solution',
    icon: <FileDoneOutlined />,
    hint: 'AI đối chiếu tri thức và đề xuất giải pháp. Chat bên dưới để chỉnh sửa, sau đó bấm Lưu SOLUTION.md.',
  },
  {
    id: 'CODE_GUIDE',
    title: 'Triển khai Code ngoài',
    shortTitle: '3. Coding',
    icon: <CodeOutlined />,
    hint: 'Coding ngoài theo SOLUTION đã chốt. Đóng gói bằng: node scripts/change-pack.mjs --cr <MÃ_CR>',
  },
  {
    id: 'CHANGE_PACK',
    title: 'Change Pack & Soi Drift',
    shortTitle: '4. Change Pack',
    icon: <InboxOutlined />,
    hint: 'Kéo thả file change-pack.zip để đối chiếu lệch giữa Code thực tế và SOLUTION.',
  },
  {
    id: 'TECH_DOCS',
    title: 'Kỹ thuật (PL03B & PL07)',
    shortTitle: '5. Kỹ thuật',
    icon: <SafetyCertificateOutlined />,
    hint: 'Soát xét và duyệt tài liệu triển khai PL03B và checklist review PL07.',
  },
  {
    id: 'CAB',
    title: 'Tờ trình phê duyệt CAB',
    shortTitle: '6. Tờ trình CAB',
    icon: <AuditOutlined />,
    hint: 'Tổng kết tự động toàn bộ hồ sơ trình Hội đồng Phê duyệt Thay đổi (CAB).',
  },
];

export const SdlcWorkflowHub: React.FC<SdlcWorkflowHubProps> = ({
  projectScoped,
  state,
  onStartWorkflow,
  onNavigateStep,
  onRerunStep,
  onResetWorkflow,
}) => {
  const { token } = theme.useToken();

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

  const currentStepIndex = STEP_CONFIGS.findIndex((s) => s.id === state.currentStep);
  const currentConfig: StepConfig = STEP_CONFIGS[currentStepIndex] ?? (STEP_CONFIGS[0] as StepConfig);
  const hasStale = state.staleSteps.length > 0;
  const isCurrentStale = state.staleSteps.includes(state.currentStep);

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
          <Space size={6}>
            <Button size="small" onClick={onStartWorkflow}>
              Sửa PL01/PL02
            </Button>
            {onResetWorkflow && (
              <Popconfirm
                title="Làm mới workflow?"
                description="Các tài liệu đã lưu trong Notes vẫn được giữ lại."
                onConfirm={onResetWorkflow}
                okText="Đồng ý"
                cancelText="Hủy"
              >
                <Button size="small" danger>
                  Làm mới
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      }
    >
      {/* Thanh 6 bước dạng Chips/Pills cuộn ngang - không bị đè chữ hay co dúm */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: '2px 0 8px',
          scrollbarWidth: 'thin',
          whiteSpace: 'nowrap',
        }}
      >
        {STEP_CONFIGS.map((cfg, idx) => {
          const isSelected = cfg.id === state.currentStep;
          const isDone = idx < currentStepIndex;
          const isStale = state.staleSteps.includes(cfg.id);

          let icon = cfg.icon;

          if (isStale) {
            icon = <ReloadOutlined />;
          } else if (isSelected) {
            icon = <SyncOutlined spin />;
          } else if (isDone) {
            icon = <CheckCircleOutlined />;
          } else {
            icon = <ClockCircleOutlined />;
          }

          return (
            <Tag.CheckableTag
              key={cfg.id}
              checked={isSelected}
              onChange={() => onNavigateStep?.(cfg.id)}
              style={{
                padding: '3px 8px',
                fontSize: 12,
                borderRadius: 4,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: isSelected ? token.colorPrimary : undefined,
                color: isSelected ? '#fff' : undefined,
                border: isStale ? `1px solid ${token.colorWarning}` : undefined,
              }}
            >
              <span>{icon}</span>
              <span>{cfg.shortTitle}</span>
              {isStale && <Badge status="warning" />}
            </Tag.CheckableTag>
          );
        })}
      </div>

      {/* Dòng trạng thái mô tả bước hiện tại */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 12,
          color: token.colorTextSecondary,
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          paddingTop: 6,
          marginTop: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 12, color: token.colorText }}>
            Bước {currentStepIndex + 1}/6: {currentConfig.title}
          </Text>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            — {currentConfig.hint}
          </span>
        </div>
        {isCurrentStale && (
          <Button
            type="primary"
            danger
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => onRerunStep?.(state.currentStep)}
          >
            Cập nhật lại
          </Button>
        )}
      </div>
    </Card>
  );
};
