import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Button, Space, message } from 'antd';
import { ApartmentOutlined, CloudServerOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getParentSystems } from '../../db/repositories/systemRepo';
import { getSshConfigs } from '../../services/sshService';
import { RemoteDirectoryBrowserModal } from '../common/RemoteDirectoryBrowserModal';
import type { System, SystemType } from '../../types/models';

export interface SystemModalProps {
  open: boolean;
  system?: System | null | undefined;
  defaultParentId?: string | null | undefined;
  onClose: () => void;
  onSave: (values: any) => Promise<void>;
  db?: TaskPlannerDatabase | undefined;
}

const SYSTEM_TYPE_OPTIONS = [
  { value: 'LOGICAL_GROUP', label: 'Parent System (Logical Group / Nhóm hệ thống logic)' },
  { value: 'SERVICE', label: 'Service / Microservice (Dịch vụ backend)' },
  { value: 'SCHEMA', label: 'Database Schema (Lược đồ CSDL)' },
  { value: 'UI', label: 'Frontend UI / Web Application (Giao diện)' },
  { value: 'WORKER', label: 'Background Worker / Batch Job (Tiến trình nền)' },
];

/**
 * Anchor an invariant error on the field the user can act on. `parentId` / `sshConfigId` are
 * only rendered for subsystems, so a parent-side violation falls back to `type` — the field
 * that caused it and the one always on screen.
 */
function invariantFieldFor(msg: string, values: { type?: SystemType }): string {
  const isParent = values.type === 'LOGICAL_GROUP';
  if (msg.includes('đã tồn tại')) return 'code';
  if (msg.includes('SSH/Repo')) return isParent ? 'type' : 'sshConfigId';
  if (msg.includes('Logical Parent') || msg.includes('vòng lặp')) {
    return isParent ? 'type' : 'parentId';
  }
  return 'type';
}

export const SystemModal: React.FC<SystemModalProps> = ({
  open,
  system,
  defaultParentId,
  onClose,
  onSave,
  db = defaultDb,
}) => {
  const [form] = Form.useForm();
  const [remoteBrowserOpen, setRemoteBrowserOpen] = useState(false);
  const selectedType = Form.useWatch('type', form);
  const selectedSshConfigId = Form.useWatch('sshConfigId', form);

  // Queries for parent systems & ssh configs
  const parentSystems = useLiveQuery(() => getParentSystems(db), [db]) ?? [];
  const sshConfigs = useLiveQuery(() => getSshConfigs(db), [db]) ?? [];

  const isLogicalGroup = selectedType === 'LOGICAL_GROUP';

  useEffect(() => {
    if (open) {
      if (system) {
        form.setFieldsValue({
          name: system.name,
          code: system.code,
          type: system.type,
          parentId: system.parentId || undefined,
          description: system.description || undefined,
          sshConfigId: system.sshConfigId || undefined,
          remoteRepoPath: system.remoteRepoPath || undefined,
          defaultBaseBranch: system.defaultBaseBranch || 'origin/main',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          type: defaultParentId ? 'SERVICE' : 'LOGICAL_GROUP',
          parentId: defaultParentId || undefined,
          defaultBaseBranch: 'origin/main',
        });
      }
    }
  }, [open, system, defaultParentId, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // Sanitize inputs
      const payload: any = {
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        type: values.type as SystemType,
        description: values.description?.trim() || undefined,
      };

      if (values.type !== 'LOGICAL_GROUP') {
        payload.parentId = values.parentId || null;
        payload.sshConfigId = values.sshConfigId || undefined;
        payload.remoteRepoPath = values.remoteRepoPath?.trim() || undefined;
        payload.defaultBaseBranch = values.defaultBaseBranch?.trim() || 'origin/main';
      } else {
        payload.parentId = null;
      }

      await onSave(payload);
    } catch (err: any) {
      if (err?.errorFields) {
        // Form validation error
        return;
      }
      // T-31.2-31: a repo invariant violation surfaces inline on the responsible field and
      // the modal stays open — no transient toast that could read as a successful save.
      const msg: string = err?.message || 'Lỗi khi lưu thông tin hệ thống';
      form.setFields([
        { name: invariantFieldFor(msg, form.getFieldsValue()), errors: [msg] },
      ]);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ApartmentOutlined style={{ color: 'var(--accent, #3871e1)' }} />
          <span>{system ? `Chỉnh sửa hệ thống: ${system.name}` : 'Tạo hệ thống mới'}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={system ? 'Lưu thay đổi' : 'Tạo hệ thống'}
      cancelText="Hủy"
      width={560}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 14 }}>
        <Form.Item
          name="type"
          label="Loại hệ thống"
          rules={[{ required: true, message: 'Vui lòng chọn loại hệ thống' }]}
        >
          <Select
            options={SYSTEM_TYPE_OPTIONS}
            placeholder="Chọn loại hệ thống"
            onChange={(val) => {
              if (val === 'LOGICAL_GROUP') {
                form.setFieldValue('parentId', undefined);
              }
            }}
          />
        </Form.Item>

        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item
            name="name"
            label="Tên hệ thống"
            rules={[{ required: true, message: 'Vui lòng nhập tên hệ thống' }]}
            style={{ flex: 2 }}
          >
            <Input placeholder="VD: SmartCard Core API" />
          </Form.Item>

          <Form.Item
            name="code"
            label="Mã hệ thống (Code)"
            normalize={(val) => (val ? String(val).toUpperCase() : val)}
            rules={[
              { required: true, message: 'Vui lòng nhập mã code' },
              {
                pattern: /^[A-Za-z0-9_-]+$/,
                message: 'Chỉ chấp nhận chữ cái, số, dấu gạch nối (- hoặc _)',
              },
            ]}
            style={{ flex: 1 }}
          >
            <Input placeholder="VD: SC-API" />
          </Form.Item>
        </div>

        {!isLogicalGroup && (
          <Form.Item
            name="parentId"
            label="Hệ thống cha (Parent Logical Group)"
            rules={[{ required: false }]}
          >
            <Select
              allowClear
              placeholder="Chọn hệ thống cha (nếu có)"
              options={parentSystems
                .filter((p) => !system || p.id !== system.id)
                .map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.code})`,
                }))}
            />
          </Form.Item>
        )}

        <Form.Item name="description" label="Mô tả chức năng">
          <Input.TextArea rows={2} placeholder="Mô tả chức năng chính của hệ thống hoặc dịch vụ..." />
        </Form.Item>

        {!isLogicalGroup && (
          <div
            style={{
              padding: 12,
              borderRadius: 6,
              background: 'var(--bg-elev, #f7f8fa)',
              border: '1px solid var(--border, #e9eaee)',
              marginTop: 6,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 10,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--fg-strong, #000000)',
              }}
            >
              <CloudServerOutlined style={{ color: '#f59e0b' }} />
              <span>Cấu hình SSH & Repository từ xa</span>
            </div>

            <Form.Item
              name="sshConfigId"
              label="Kết nối SSH máy chủ"
              rules={[{ required: false }]}
              style={{ marginBottom: 10 }}
            >
              <Select
                allowClear
                placeholder="Chọn cấu hình SSH đã lưu"
                options={sshConfigs.map((cfg) => ({
                  value: cfg.id,
                  label: `${cfg.name} (${cfg.username}@${cfg.host}:${cfg.port})`,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="remoteRepoPath"
              label="Đường dẫn Repository trên máy chủ (Absolute path)"
              rules={[
                {
                  validator: async (_, value) => {
                    if (!value) return Promise.resolve();
                    const trimmed = String(value).trim();
                    if (!trimmed.startsWith('/')) {
                      return Promise.reject(
                        new Error('Đường dẫn repository trên máy chủ phải là đường dẫn tuyệt đối (bắt đầu bằng /)')
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
              style={{ marginBottom: 10 }}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Input placeholder="VD: /data/services/smartcard-api" />
                <Button
                  icon={<FolderOpenOutlined />}
                  title="Duyệt thư mục trên máy chủ SSH"
                  onClick={() => {
                    if (!selectedSshConfigId) {
                      message.warning('Vui lòng chọn Kết nối SSH máy chủ trước khi duyệt thư mục từ xa.');
                      return;
                    }
                    setRemoteBrowserOpen(true);
                  }}
                >
                  Duyệt SSH...
                </Button>
              </Space.Compact>
            </Form.Item>

            <Form.Item
              name="defaultBaseBranch"
              label="Nhánh base mặc định"
              rules={[{ required: false }]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="VD: origin/main hoặc origin/master" />
            </Form.Item>
          </div>
        )}
      </Form>

      <RemoteDirectoryBrowserModal
        open={remoteBrowserOpen}
        sshConfig={sshConfigs.find((c) => c.id === selectedSshConfigId)}
        initialPath={form.getFieldValue('remoteRepoPath') || ''}
        onSelect={(selectedPath) => {
          form.setFieldValue('remoteRepoPath', selectedPath);
          setRemoteBrowserOpen(false);
        }}
        onCancel={() => setRemoteBrowserOpen(false)}
      />
    </Modal>
  );
};

export default SystemModal;
