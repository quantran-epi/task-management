import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, AutoComplete, Button, useMessage, FormItem, SpaceCompact, TextArea, useForm, useWatch } from '../ui';
import { ApartmentOutlined, CloudServerOutlined, FolderOpenOutlined, LinkOutlined } from '../ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getParentSystems } from '../../db/repositories/systemRepo';
import { getSshConfigs } from '../../services/sshService';
import { RemoteDirectoryBrowserModal } from '../common/RemoteDirectoryBrowserModal';
import {
  LOGICAL_GROUP_TYPE,
  SYSTEM_TYPE_VALUE_MAX_LENGTH,
  ensureSystemTypeOption,
  toSystemTypeValue,
  useSystemTypeOptions,
} from '../../services/system/systemTypeSettings';
import type { System, SystemType } from '../../types/models';
import { GIT_REPO_URL_MESSAGE, isValidGitRepoUrl } from '../../validation/schemas';
import { foldForSearch, searchIncludes } from '../../utils/searchText';

export interface SystemModalProps {
  open: boolean;
  system?: System | null | undefined;
  defaultParentId?: string | null | undefined;
  onClose: () => void;
  onSave: (values: any) => Promise<void>;
  db?: TaskPlannerDatabase | undefined;
}

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
  const message = useMessage();
  const [form] = useForm();
  const [remoteBrowserOpen, setRemoteBrowserOpen] = useState(false);
  const selectedType = useWatch('type', form);
  const selectedSshConfigId = useWatch('sshConfigId', form);

  // Queries for parent systems & ssh configs
  const parentSystems = useLiveQuery(() => getParentSystems(db), [db]) ?? [];
  const sshConfigs = useLiveQuery(() => getSshConfigs(db), [db]) ?? [];
  const typeOptions = useSystemTypeOptions(db);

  const isLogicalGroup =
    toSystemTypeValue(String(selectedType ?? ''), typeOptions) === LOGICAL_GROUP_TYPE;

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
          gitSourceUrl: system.gitSourceUrl || undefined,
          gitOpsUrl: system.gitOpsUrl || undefined,
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
      const normalizedType = toSystemTypeValue(String(values.type ?? ''), typeOptions);
      // Persist a freshly typed type before saving so validation and every surface accept it.
      if (!typeOptions.some((opt) => opt.value === normalizedType)) {
        await ensureSystemTypeOption(normalizedType, db, String(values.type ?? ''));
      }
      // Sanitize inputs
      const payload: any = {
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        type: normalizedType as SystemType,
        description: values.description?.trim() || undefined,
        gitSourceUrl: values.gitSourceUrl?.trim() || undefined,
        gitOpsUrl: values.gitOpsUrl?.trim() || undefined,
      };

      if (normalizedType !== LOGICAL_GROUP_TYPE) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}>
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
        <FormItem
          name="type"
          label="Loại hệ thống"
          getValueProps={(value) => ({
            value: typeOptions.find((opt) => opt.value === value)?.label ?? value,
          })}
          rules={[
            { required: true, message: 'Vui lòng chọn loại hệ thống' },
            {
              validator: async (_, typed: string) => {
                const raw = String(typed ?? '').trim();
                if (!raw) return;
                if (toSystemTypeValue(raw, typeOptions)) return;
                throw new Error(
                  'Loại hệ thống phải có chữ cái hoặc số (ví dụ: Service, Payment Gateway)'
                );
              },
            },
            {
              max: SYSTEM_TYPE_VALUE_MAX_LENGTH,
              message: `Loại hệ thống tối đa ${SYSTEM_TYPE_VALUE_MAX_LENGTH} ký tự`,
            },
          ]}
        >
          <AutoComplete
            options={typeOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
            placeholder="Chọn hoặc nhập loại hệ thống mới"
            filterOption={(input, option) => {
              const q = foldForSearch(String(input ?? ''));
              const opt = typeOptions.find((o) => o.value === option?.value);
              return (
                searchIncludes(String(option?.value ?? ''), q) ||
                searchIncludes(opt?.label ?? '', q)
              );
            }}
            onChange={(typed) => {
              if (toSystemTypeValue(String(typed ?? ''), typeOptions) === LOGICAL_GROUP_TYPE) {
                form.setFieldValue('parentId', undefined);
              }
            }}
          />
        </FormItem>

        <div style={{ display: 'flex', gap: 'var(--gap-12)' }}>
          <FormItem
            name="name"
            label="Tên hệ thống"
            rules={[{ required: true, message: 'Vui lòng nhập tên hệ thống' }]}
            style={{ flex: 2 }}
          >
            <Input placeholder="VD: SmartCard Core API" />
          </FormItem>

          <FormItem
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
          </FormItem>
        </div>

        {!isLogicalGroup && (
          <FormItem
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
          </FormItem>
        )}

        <FormItem name="description" label="Mô tả chức năng">
          <TextArea rows={2} placeholder="Mô tả chức năng chính của hệ thống hoặc dịch vụ..." />
        </FormItem>

        <div
          style={{
            padding: 12,
            borderRadius: 'var(--radius-control)',
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
              gap: 'var(--gap-6)',
              marginBottom: 10,
              fontSize: 'var(--font-size-small)',
              fontWeight: 600,
              color: 'var(--fg-strong, #000000)',
            }}
          >
            <LinkOutlined style={{ color: 'var(--accent)' }} />
            <span>Link Git</span>
          </div>

          <FormItem
            name="gitSourceUrl"
            label="Link Git Source Code"
            rules={[
              {
                validator: async (_, value) => {
                  if (!value) return;
                  if (!value.trim() || !isValidGitRepoUrl(value)) {
                    throw new Error(GIT_REPO_URL_MESSAGE);
                  }
                },
              },
            ]}
            style={{ marginBottom: 10 }}
          >
            <Input placeholder="https://github.com/owner/repo.git" />
          </FormItem>

          <FormItem
            name="gitOpsUrl"
            label="Link Git GitOps"
            rules={[
              {
                validator: async (_, value) => {
                  if (!value) return;
                  if (!value.trim() || !isValidGitRepoUrl(value)) {
                    throw new Error(GIT_REPO_URL_MESSAGE);
                  }
                },
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="git@github.com:owner/repo.git" />
          </FormItem>
        </div>

        {!isLogicalGroup && (
          <div
            style={{
              padding: 12,
              borderRadius: 'var(--radius-control)',
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
                gap: 'var(--gap-6)',
                marginBottom: 10,
                fontSize: 'var(--font-size-small)',
                fontWeight: 600,
                color: 'var(--fg-strong, #000000)',
              }}
            >
              <CloudServerOutlined style={{ color: '#f59e0b' }} />
              <span>Cấu hình SSH & Repository từ xa</span>
            </div>

            <FormItem
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
            </FormItem>

            <FormItem label="Đường dẫn Repository trên máy chủ (Absolute path)" htmlFor="remoteRepoPath" style={{ marginBottom: 10 }}>
              <SpaceCompact style={{ width: '100%' }}>
                <FormItem
                  name="remoteRepoPath"
                  noStyle
                  rules={[
                    {
                      validator: async (_, value) => {
                        if (!value) return;
                        if (!String(value).trim().startsWith('/')) {
                          throw new Error('Đường dẫn repository trên máy chủ phải là đường dẫn tuyệt đối (bắt đầu bằng /)');
                        }
                      },
                    },
                  ]}
                >
                  <Input placeholder="VD: /data/services/smartcard-api" />
                </FormItem>
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
              </SpaceCompact>
            </FormItem>

            <FormItem
              name="defaultBaseBranch"
              label="Nhánh base mặc định"
              rules={[{ required: false }]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="VD: origin/main hoặc origin/master" />
            </FormItem>
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
