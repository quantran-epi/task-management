import React from 'react';
import {
  AuditOutlined,
  CodeOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  InboxOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Badge, Button, Card, Popconfirm, Space, Steps, Tag, Typography, theme } from 'antd';
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

const STEP_CONFIGS: Array<{ id: SdlcStepId; title: string; icon: React.ReactNode }> = [
  { id: 'INTAKE', title: 'Hồ sơ Đầu vào', icon: <FileTextOutlined /> },
  { id: 'SOLUTION', title: 'Giải pháp SOLUTION.md', icon: <FileDoneOutlined /> },
  { id: 'CODE_GUIDE', title: 'Triển khai Code', icon: <CodeOutlined /> },
  { id: 'CHANGE_PACK', title: 'Change Pack & Drift', icon: <InboxOutlined /> },
  { id: 'TECH_DOCS', title: 'Kỹ thuật PL03B / PL07', icon: <SafetyCertificateOutlined /> },
  { id: 'CAB', title: 'Tờ trình CAB', icon: <AuditOutlined /> },
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
      <Card size="small" style={{ marginBottom: 8, borderColor: token.colorBorderSecondary }}>
        <Text type="secondary">Chọn phạm vi Dự án để kích hoạt Quy trình SDLC Developer.</Text>
      </Card>
    );
  }

  if (!state) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: token.colorFillAlter, borderRadius: token.borderRadius, marginBottom: 8, border: `1px solid ${token.colorBorderSecondary}` }}>
        <Space>
          <Badge status="default" />
          <span style={{ fontWeight: 600 }}>Quy trình SDLC Developer:</span>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Chưa khởi tạo quy trình cho dự án này.
          </Text>
        </Space>
        <Button type="primary" size="small" icon={<FileTextOutlined />} onClick={onStartWorkflow}>
          Khởi tạo SDLC Workflow (PL01 & PL02)
        </Button>
      </div>
    );
  }

  const currentStepIndex = STEP_CONFIGS.findIndex((s) => s.id === state.currentStep);
  const hasStale = state.staleSteps.length > 0;

  const getStepStatus = (stepId: SdlcStepId, index: number): 'wait' | 'process' | 'finish' | 'error' => {
    if (state.staleSteps.includes(stepId)) return 'error'; // dùng error để hiện màu cam cảnh báo
    if (index < currentStepIndex) return 'finish';
    if (index === currentStepIndex) return 'process';
    return 'wait';
  };

  return (
    <Card
      size="small"
      style={{
        marginBottom: 8,
        borderColor: hasStale ? token.colorWarning : token.colorBorderSecondary,
        backgroundColor: token.colorFillAlter,
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <span style={{ fontSize: 14, fontWeight: 600 }}>SDLC Workflow: {state.metadata.featureName}</span>
            <Tag color="blue">{state.metadata.cr}</Tag>
            {hasStale && (
              <Tag color="warning" icon={<ReloadOutlined />}>
                Có {state.staleSteps.length} bước cần cập nhật lại
              </Tag>
            )}
          </Space>
          <Space>
            <Button size="small" onClick={onStartWorkflow}>
              Sửa Đầu vào PL01/PL02
            </Button>
            {onResetWorkflow && (
              <Popconfirm
                title="Khởi tạo lại workflow?"
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
      <Steps
        size="small"
        current={currentStepIndex}
        onChange={(current) => {
          const target = STEP_CONFIGS[current];
          if (target && onNavigateStep) onNavigateStep(target.id);
        }}
        items={STEP_CONFIGS.map((cfg, idx) => {
          const isStale = state.staleSteps.includes(cfg.id);
          const status = getStepStatus(cfg.id, idx);
          return {
            key: cfg.id,
            title: cfg.title,
            icon: isStale ? <ReloadOutlined style={{ color: token.colorWarning }} /> : cfg.icon,
            status: isStale ? 'error' : status,
            description: isStale ? (
              <Button
                type="link"
                size="small"
                danger
                onClick={(e) => {
                  e.stopPropagation();
                  onRerunStep?.(cfg.id);
                }}
              >
                Cập nhật
              </Button>
            ) : undefined,
          };
        })}
      />
    </Card>
  );
};
