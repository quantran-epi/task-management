import React, { useState } from 'react';
import { Button, Select, Space, Typography, Progress, Tag, theme, Modal, Form, Input, DatePicker, message } from 'antd';
import {
  PlusOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  WarningFilled,
  FileTextOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { listCrs, createNewCr, type SdlcCrRecord } from '../../services/wizard/sdlcCrManager';
import type { SdlcStepId } from '../../services/wizard/workflowSchemas';
import dayjs from 'dayjs';

export interface SdlcSidebarProps {
  projectId: string;
  selectedStep: SdlcStepId;
  onSelectStep: (step: SdlcStepId) => void;
  activeCrId?: string;
  onSelectCr?: (crId: string) => void;
  db?: TaskPlannerDatabase;
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
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  const crs = useLiveQuery(() => listCrs(projectId, db), [projectId, db]) ?? [];
  const currentCr = crs.find((c) => (activeCrId ? c.id === activeCrId : c.status === 'active')) ?? crs[0];

  const currentStepIndex = SDLC_STEPS_CONFIG.findIndex((s) => s.id === selectedStep);
  const progressPercent = Math.round(((currentStepIndex + 1) / SDLC_STEPS_CONFIG.length) * 100);

  const handleCreateNewCr = async () => {
    try {
      const values = await form.validateFields();
      await createNewCr(
        projectId,
        {
          cr: values.cr,
          featureName: values.featureName,
          author: values.author,
          requestingUnit: values.requestingUnit,
          date: values.date.format('YYYY-MM-DD'),
        },
        false,
        db
      );
      message.success('Đã tạo CR mới thành công');
      setCreateModalOpen(false);
      form.resetFields();
    } catch {
      // Form validation error
    }
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
          >
            Tạo CR mới
          </Button>
        </div>

        {crs.length > 0 ? (
          <Select
            style={{ width: '100%' }}
            value={currentCr?.id}
            onChange={(val) => onSelectCr?.(val)}
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
        {SDLC_STEPS_CONFIG.map((step, idx) => {
          const isSelected = step.id === selectedStep;
          return (
            <div
              key={step.id}
              onClick={() => onSelectStep(step.id)}
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
                  color: isSelected ? token.colorPrimary : token.colorTextSecondary,
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {step.icon}
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
            </div>
          );
        })}
      </div>

      {/* New CR Modal */}
      <Modal
        title="Tạo Change Request (CR) mới"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateNewCr}
        okText="Tạo CR"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ date: dayjs() }}>
          <Form.Item name="cr" label="Mã CR" rules={[{ required: true, message: 'Vui lòng nhập mã CR' }]}>
            <Input placeholder="Ví dụ: CR-2026-001" />
          </Form.Item>
          <Form.Item name="featureName" label="Tên tính năng" rules={[{ required: true, message: 'Vui lòng nhập tên tính năng' }]}>
            <Input placeholder="Ví dụ: Nâng cấp luồng chuyển tiền Napas 247" />
          </Form.Item>
          <Form.Item name="author" label="Người lập" rules={[{ required: true, message: 'Vui lòng nhập tên người lập' }]}>
            <Input placeholder="Ví dụ: Nguyễn Văn A" />
          </Form.Item>
          <Form.Item name="requestingUnit" label="Đơn vị yêu cầu" rules={[{ required: true, message: 'Vui lòng nhập đơn vị' }]}>
            <Input placeholder="Ví dụ: Khối Ngân hàng số" />
          </Form.Item>
          <Form.Item name="date" label="Ngày lập" rules={[{ required: true, message: 'Vui lòng chọn ngày lập' }]}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
