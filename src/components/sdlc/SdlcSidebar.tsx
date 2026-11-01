import React, { useState } from 'react';
import { Button, Select, Typography, Progress, Tag, theme } from 'antd';
import {
  PlusOutlined,
  FileTextOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { listCrs, type SdlcCrRecord } from '../../services/wizard/sdlcCrManager';
import type { SdlcStepId, SdlcWorkflowState } from '../../services/wizard/workflowSchemas';
import { CrCreateModal } from './common/CrCreateModal';

export interface SdlcSidebarProps {
  projectId: string;
  selectedStep: SdlcStepId;
  onSelectStep: (step: SdlcStepId) => void;
  activeCrId?: string | undefined;
  onSelectCr?: ((crId: string) => void) | undefined;
  workflowState?: SdlcWorkflowState | undefined;
  db?: TaskPlannerDatabase | undefined;
}

export const SDLC_STEPS_CONFIG: Array<{
  id: SdlcStepId;
  title: string;
  icon: React.ReactNode;
  description: string;
}> = [
  { id: 'INTAKE', title: 'Bước 1: Nạp PL01 & PL02', icon: <FileTextOutlined />, description: 'Yêu cầu nghiệp vụ & đặc tả' },
  { id: 'SOLUTION', title: 'Bước 2: Thiết kế giải pháp', icon: <CodeOutlined />, description: 'Soạn thảo SOLUTION.md' },
  { id: 'CODE_GUIDE', title: 'Bước 3: Coding ngoài', icon: <DeploymentUnitOutlined />, description: 'Lệnh pack & hướng dẫn code' },
  { id: 'CHANGE_PACK', title: 'Bước 4: Nạp Change Pack', icon: <AuditOutlined />, description: 'Soi ma trận drift & zip' },
  { id: 'TECH_DOCS', title: 'Bước 5: Tài liệu kỹ thuật', icon: <FileTextOutlined />, description: 'Sinh PL03B & checklist PL07' },
  { id: 'CAB', title: 'Bước 6: Tờ trình CAB', icon: <SafetyCertificateOutlined />, description: 'Xuất bản giao & đóng CR' },
];

export const SdlcSidebar: React.FC<SdlcSidebarProps> = ({
  projectId,
  selectedStep,
  onSelectStep,
  activeCrId,
  onSelectCr,
  workflowState,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const crs = useLiveQuery(() => listCrs(projectId, db), [projectId, db]) ?? [];
  const currentCr = crs.find((c) => (activeCrId ? c.id === activeCrId : c.status === 'active')) ?? crs[0];

  const isStepCompleted = (stepId: SdlcStepId): boolean => {
    if (!workflowState) return false;
    switch (stepId) {
      case 'INTAKE':
        return Boolean(workflowState.artifacts?.pl01 && workflowState.artifacts?.pl02);
      case 'SOLUTION':
        return Boolean(workflowState.artifacts?.solution);
      case 'CODE_GUIDE':
        return Boolean(workflowState.artifacts?.solution);
      case 'CHANGE_PACK':
        return Boolean(workflowState.artifacts?.changePack);
      case 'TECH_DOCS':
        return Boolean(workflowState.artifacts?.pl03b && workflowState.artifacts?.pl07);
      case 'CAB':
        return Boolean(workflowState.artifacts?.cab);
      default:
        return false;
    }
  };

  const completedCount = SDLC_STEPS_CONFIG.filter((s) => isStepCompleted(s.id)).length;
  const currentStepIndex = SDLC_STEPS_CONFIG.findIndex((s) => s.id === selectedStep);
  const progressPercent = Math.round(
    Math.max((completedCount / SDLC_STEPS_CONFIG.length) * 100, ((currentStepIndex + 1) / SDLC_STEPS_CONFIG.length) * 100)
  );

  const handleCrCreated = (newCr: SdlcCrRecord) => {
    onSelectCr?.(newCr.id);
  };

  return (
    <div
      data-testid="sdlc-sidebar"
      style={{
        width: 300,
        height: '100%',
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 12px',
        gap: 16,
        boxSizing: 'border-box',
      }}
    >
      {/* CR Selector Header */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Typography.Text strong style={{ fontSize: 13, color: token.colorTextSecondary }}>
            Change Request (CR)
          </Typography.Text>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            style={{ padding: 0 }}
            onClick={() => setCreateModalOpen(true)}
            data-testid="sidebar-btn-create-cr"
          >
            Tạo CR mới
          </Button>
        </div>

        {crs.length > 0 ? (
          <Select
            style={{ width: '100%' }}
            value={currentCr?.id}
            onChange={(val) => {
              if (val) onSelectCr?.(val);
            }}
            data-testid="sidebar-cr-select"
            options={crs.map((c) => ({
              value: c.id,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{c.crCode}</span>
                  <Tag color={c.status === 'active' ? 'processing' : c.status === 'completed' ? 'success' : 'default'} style={{ margin: 0 }}>
                    {c.status === 'active' ? 'Đang chạy' : c.status === 'completed' ? 'Hoàn tất' : 'Lưu trữ'}
                  </Tag>
                </div>
              ),
            }))}
          />
        ) : (
          <Button
            block
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() => setCreateModalOpen(true)}
            data-testid="sidebar-btn-first-cr"
          >
            Khởi tạo CR đầu tiên
          </Button>
        )}
      </div>

      {/* Progress Summary */}
      <div style={{ background: token.colorFillAlter, padding: '10px 12px', borderRadius: token.borderRadiusSM }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <Typography.Text style={{ fontSize: 12, color: token.colorTextSecondary }}>Tiến độ quy trình</Typography.Text>
          <Typography.Text strong style={{ fontSize: 12 }}>
            Bước {currentStepIndex + 1}/6 ({progressPercent}%)
          </Typography.Text>
        </div>
        <Progress percent={progressPercent} size="small" showInfo={false} strokeColor={token.colorPrimary} />
      </div>

      {/* Stepper Vertical List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SDLC_STEPS_CONFIG.map((step) => {
          const isSelected = step.id === selectedStep;
          return (
            <div
              key={step.id}
              onClick={() => onSelectStep(step.id)}
              data-testid={`sidebar-step-${step.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: token.borderRadiusSM,
                cursor: 'pointer',
                background: isSelected ? token.colorPrimaryBg : 'transparent',
                border: `1px solid ${isSelected ? token.colorPrimaryBorder : 'transparent'}`,
                transition: 'all 0.2s ease',
              }}
            >
              <div
                style={{
                  color: isStepCompleted(step.id)
                    ? '#52c41a'
                    : isSelected
                      ? token.colorPrimary
                      : token.colorTextSecondary,
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {isStepCompleted(step.id) ? <CheckCircleFilled /> : step.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? token.colorPrimaryText : token.colorText,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: token.colorTextTertiary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {step.description}
                </div>
              </div>
              {isStepCompleted(step.id) && (
                <Tag color="success" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>
                  Xong
                </Tag>
              )}
            </div>
          );
        })}
      </div>

      {/* New CR Modal */}
      <CrCreateModal
        projectId={projectId}
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCrCreated={handleCrCreated}
        db={db}
      />
    </div>
  );
};
