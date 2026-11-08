import React, { useState } from 'react';
import { Button, Select, Typography, Progress, Tag, message, theme } from 'antd';
import {
  PlusOutlined,
  FileTextOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  CheckCircleFilled,
  BranchesOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { createChangeRequest, updateChangeRequest } from '../../db/repositories/changeRequestRepo';
import { updateSystem } from '../../db/repositories/systemRepo';
import { getSshConfigs } from '../../services/sshService';
import { ChangeRequestModal } from '../changeRequests/ChangeRequestModal';
import { SystemModal } from '../systems/SystemModal';
import { SubsystemsReposPanel } from './SubsystemsReposPanel';
import type { System } from '../../types/models';
import type { SdlcStepId, SdlcWorkflowState } from '../../services/wizard/workflowSchemas';

export interface SdlcSidebarProps {
  changeRequestId: string;
  onSelectChangeRequest?: ((changeRequestId: string) => void) | undefined;
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
  changeRequestId,
  onSelectChangeRequest,
  selectedStep,
  onSelectStep,
  activeCrId,
  onSelectCr,
  workflowState,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<System | null>(null);
  const [editCrOpen, setEditCrOpen] = useState(false);

  // Single CR source: db.changeRequests (D-36). No legacy sdlcCrManager fallback.
  // WR-14: never fall back to `crs[0]` — a stale active id must render the empty state,
  // not another CR's code, targets and progress.
  const crs = useLiveQuery(() => db.changeRequests.toArray(), [db]) ?? [];
  const requestedCrId = activeCrId || changeRequestId;
  const currentCr = requestedCrId ? crs.find((c) => c.id === requestedCrId) : crs[0];

  // Resolve ChangeRequest and its target subsystems from DB
  const resolvedCrId = currentCr?.id;
  const crRecord = useLiveQuery(
    () => (resolvedCrId ? db.changeRequests.get(resolvedCrId) : undefined),
    [resolvedCrId, db]
  );
  const targetSystems = useLiveQuery(async () => {
    const ids = crRecord?.targets?.map((t) => t.systemId) ?? [];
    if (ids.length === 0) return [];
    return db.systems.where('id').anyOf(ids).toArray();
  }, [crRecord?.targets, db]) ?? [];
  const sshConfigs = useLiveQuery(() => getSshConfigs(db), [db]) ?? [];

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
      {/* 📋 TẦNG DUY NHẤT: CHANGE REQUEST (CR SELECTOR & TARGET SUBSYSTEMS) */}
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
            <BranchesOutlined />
            Change Request (CR)
          </Typography.Text>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            style={{ padding: 0, height: 'auto', fontSize: 12 }}
            onClick={() => setCreateModalOpen(true)}
            data-testid="sidebar-btn-create-cr"
          >
            Tạo CR
          </Button>
        </div>

        {crs.length > 0 ? (
          <Select
            style={{ width: '100%' }}
            value={currentCr?.id}
            onChange={(val) => {
              if (val) {
                onSelectCr?.(val);
                onSelectChangeRequest?.(val);
              }
            }}
            data-testid="sidebar-cr-select"
            showSearch
            filterOption={(input, option) =>
              (option?.searchStr ?? '').toLowerCase().includes(input.toLowerCase())
            }
            options={crs.map((c) => {
              const code = c.code || 'CR';
              const name = c.name || '';
              const type = c.type;
              return {
                value: c.id,
                searchStr: `${code} ${name}`,
                label: (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{code}</span>
                      <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </span>
                    </div>
                    {type && (
                      <Tag
                        color={type === 'NEW_FEATURE' ? '#1677ff' : type === 'ENHANCEMENT' ? '#52c41a' : '#faad14'}
                        style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                      >
                        {type === 'NEW_FEATURE' ? 'Tạo mới' : type === 'ENHANCEMENT' ? 'Nâng cấp' : 'Sửa lỗi'}
                      </Tag>
                    )}
                  </div>
                ),
              };
            })}
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

        {/* Target Subsystems pills for active CR (ENT-SYS-03, ENT-CR-02) */}
        {crRecord && (
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="sidebar-target-systems">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography.Text style={{ fontSize: 11, color: token.colorTextTertiary }}>
                Subsystems ảnh hưởng:
              </Typography.Text>
              {crRecord.type && (
                <Tag
                  color={
                    crRecord.type === 'NEW_FEATURE'
                      ? '#1677ff'
                      : crRecord.type === 'ENHANCEMENT'
                        ? '#52c41a'
                        : '#faad14'
                  }
                  style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
                >
                  {crRecord.type === 'NEW_FEATURE'
                    ? 'Tạo mới'
                    : crRecord.type === 'ENHANCEMENT'
                      ? 'Nâng cấp'
                      : 'Sửa lỗi'}
                </Tag>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {targetSystems.length > 0 ? (
                targetSystems.map((sys) => (
                  <Tag
                    key={sys.id}
                    color="cyan"
                    icon={<BranchesOutlined style={{ fontSize: 10 }} />}
                    style={{
                      margin: 0,
                      fontSize: 10,
                      lineHeight: '18px',
                      padding: '0 6px',
                      fontFamily: 'monospace',
                    }}
                    title={`${sys.name} (${sys.code}) - ${sys.remoteRepoPath || 'Chưa có repo'}`}
                  >
                    {sys.code}
                  </Tag>
                ))
              ) : (
                <Tag color="warning" style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                  Chưa gán subsystem
                </Tag>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 🚀 TẦNG 3: QUY TRÌNH THỰC THI (6 BƯỚC) */}
      {currentCr ? (
        <>
          {/* Progress Summary */}
          <div style={{ background: token.colorFillAlter, padding: '8px 10px', borderRadius: token.borderRadiusSM }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Typography.Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
                Tiến độ ({currentCr.code})
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
              const isSelected = step.id === selectedStep;
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

          {/* Read-only Subsystems & Repos observation panel (D-37, UI-SPEC §5b) */}
          {crRecord && (
            <SubsystemsReposPanel
              changeRequest={crRecord}
              systems={targetSystems}
              sshConfigs={sshConfigs}
              onEditSubsystem={(system) => setEditingSystem(system)}
              onChooseSubsystem={() => setEditCrOpen(true)}
            />
          )}
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
            Chưa chọn Change Request (CR) nào. Hãy nhấn "Tạo CR" ở trên để bắt đầu quy trình SDLC.
          </Typography.Text>
        </div>
      )}

      {/* New CR Modal */}
      <ChangeRequestModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSave={async (values) => {
          try {
            const newCr = await createChangeRequest(values as any, db);
            message.success('Đã tạo Change Request mới');
            setCreateModalOpen(false);
            if (newCr?.id) {
              onSelectCr?.(newCr.id);
              onSelectChangeRequest?.(newCr.id);
            }
          } catch (err: any) {
            message.error(err?.message || 'Không thể tạo Change Request');
          }
        }}
        db={db}
      />

      {/* Read-only panel handoff: the only config path is System Catalog (T-31.2-38) */}
      <SystemModal
        open={Boolean(editingSystem)}
        system={editingSystem}
        onClose={() => setEditingSystem(null)}
        onSave={async (values) => {
          if (!editingSystem) return;
          await updateSystem(editingSystem.id, values, db);
          message.success('Đã cập nhật subsystem');
          setEditingSystem(null);
        }}
        db={db}
      />

      {/* Empty state handoff: attach subsystems to the current CR */}
      <ChangeRequestModal
        open={editCrOpen}
        changeRequest={crRecord ?? null}
        onClose={() => setEditCrOpen(false)}
        onSave={async (values) => {
          if (!crRecord) return;
          await updateChangeRequest(crRecord.id, values as any, db);
          message.success('Đã cập nhật subsystem của CR');
          setEditCrOpen(false);
        }}
        db={db}
      />
    </div>
  );
};
