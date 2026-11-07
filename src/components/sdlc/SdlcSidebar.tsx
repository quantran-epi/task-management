import React, { useState } from 'react';
import { Button, Select, Typography, Progress, Tag, Space, Divider, theme } from 'antd';
import {
  PlusOutlined,
  FileTextOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  CheckCircleFilled,
  BranchesOutlined,
  FolderOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { listCrs, type SdlcCrRecord } from '../../services/wizard/sdlcCrManager';
import { getProjectRepoSshBinding } from '../../services/gitRemoteService';
import type { SdlcStepId, SdlcWorkflowState } from '../../services/wizard/workflowSchemas';
import { CrCreateModal } from './common/CrCreateModal';

export interface SdlcSidebarProps {
  projectId: string;
  onSelectProject?: ((projectId: string) => void) | undefined;
  selectedStep: SdlcStepId;
  onSelectStep: (step: SdlcStepId) => void;
  activeCrId?: string | undefined;
  onSelectCr?: ((crId: string) => void) | undefined;
  workflowState?: SdlcWorkflowState | undefined;
  isConfigActive?: boolean | undefined;
  onSelectConfig?: (() => void) | undefined;
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
  onSelectProject,
  selectedStep,
  onSelectStep,
  activeCrId,
  onSelectCr,
  workflowState,
  isConfigActive = false,
  onSelectConfig,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // 1. Projects list for Tier 1
  const projects = useLiveQuery(() => db.projects.toArray(), [db]) ?? [];

  // Project SSH binding for quick status badge
  const binding = useLiveQuery(
    () => (projectId ? getProjectRepoSshBinding(projectId, db) : null),
    [projectId, db]
  );

  // 2. CRs list for Tier 2
  const crs = useLiveQuery(
    () => (projectId ? listCrs(projectId, db) : []),
    [projectId, db]
  ) ?? [];
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
        width: 310,
        height: '100%',
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 12px',
        gap: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* 📁 TẦNG 1: DỰ ÁN (PROJECT SELECTOR & REPO STATUS) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text
            strong
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: token.colorTextTertiary,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <FolderOutlined />
            Dự án (Project)
          </Typography.Text>
        </div>

        <Select
          style={{ width: '100%' }}
          placeholder="Chọn dự án..."
          value={projectId || undefined}
          onChange={(val) => {
            if (val) onSelectProject?.(val);
          }}
          data-testid="sidebar-project-select"
          showSearch
          filterOption={(input, option) =>
            (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
          }
          options={projects.map((p) => ({
            value: p.id,
            label: p.name,
          }))}
        />

        {/* Project Repo SSH Binding Quick Banner */}
        <div
          onClick={onSelectConfig}
          data-testid="sidebar-btn-repo-config"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 8px',
            borderRadius: token.borderRadiusSM,
            cursor: 'pointer',
            background: isConfigActive ? token.colorPrimaryBg : token.colorFillAlter,
            border: `1px solid ${isConfigActive ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
            transition: 'all 0.15s ease',
          }}
          title="Nhấn để mở Cấu hình Repo & Quy ước của Dự án"
        >
          <Space size={6} style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
            <BranchesOutlined
              style={{
                fontSize: 13,
                color: isConfigActive ? token.colorPrimary : binding ? token.colorSuccess : token.colorTextTertiary,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontFamily: binding ? 'monospace' : 'inherit',
                color: isConfigActive ? token.colorPrimaryText : token.colorTextSecondary,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {binding ? binding.remoteRepoPath : 'Chưa liên kết SSH'}
            </span>
          </Space>
          <Tag
            color={isConfigActive ? 'processing' : binding ? 'success' : 'default'}
            icon={<SettingOutlined style={{ fontSize: 10 }} />}
            style={{ margin: 0, fontSize: 10, padding: '0 5px', lineHeight: '18px', cursor: 'pointer' }}
          >
            {isConfigActive ? 'Đang mở' : 'Cấu hình'}
          </Tag>
        </div>
      </div>

      <Divider style={{ margin: '2px 0' }} />

      {/* 📋 TẦNG 2: CHANGE REQUEST (CR SELECTOR) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography.Text
            strong
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: token.colorTextTertiary,
            }}
          >
            Change Request (CR)
          </Typography.Text>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            style={{ padding: 0, height: 'auto', fontSize: 12 }}
            onClick={() => setCreateModalOpen(true)}
            data-testid="sidebar-btn-create-cr"
            disabled={!projectId}
          >
            Tạo CR
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
                  <Tag
                    color={c.status === 'active' ? 'processing' : c.status === 'completed' ? 'success' : 'default'}
                    style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}
                  >
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
            disabled={!projectId}
          >
            Khởi tạo CR đầu tiên
          </Button>
        )}
      </div>

      {/* 🚀 TẦNG 3: QUY TRÌNH THỰC THI (6 BƯỚC) */}
      {currentCr ? (
        <>
          {/* Progress Summary */}
          <div style={{ background: token.colorFillAlter, padding: '8px 10px', borderRadius: token.borderRadiusSM }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Typography.Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
                Tiến độ ({currentCr.crCode})
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 11 }}>
                Bước {currentStepIndex + 1}/6 ({progressPercent}%)
              </Typography.Text>
            </div>
            <Progress percent={progressPercent} size="small" showInfo={false} strokeColor={token.colorPrimary} />
          </div>

          {/* Stepper Vertical List */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SDLC_STEPS_CONFIG.map((step) => {
              const isSelected = !isConfigActive && step.id === selectedStep;
              return (
                <div
                  key={step.id}
                  onClick={() => onSelectStep(step.id)}
                  data-testid={`sidebar-step-${step.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: token.borderRadiusSM,
                    cursor: 'pointer',
                    background: isSelected ? token.colorPrimaryBg : 'transparent',
                    border: `1px solid ${isSelected ? token.colorPrimaryBorder : 'transparent'}`,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      color: isStepCompleted(step.id)
                        ? '#52c41a'
                        : isSelected
                          ? token.colorPrimary
                          : token.colorTextSecondary,
                      fontSize: 15,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {isStepCompleted(step.id) ? <CheckCircleFilled /> : step.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
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
        </>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            textAlign: 'center',
            color: token.colorTextTertiary,
            background: token.colorFillAlter,
            borderRadius: token.borderRadiusSM,
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {projectId
              ? 'Chưa có CR nào trong dự án này. Hãy nhấn "Tạo CR" ở trên để bắt đầu quy trình.'
              : 'Vui lòng chọn một dự án ở trên.'}
          </Typography.Text>
        </div>
      )}

      {/* New CR Modal */}
      {projectId && (
        <CrCreateModal
          projectId={projectId}
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCrCreated={handleCrCreated}
          db={db}
        />
      )}
    </div>
  );
};
