import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Radio,
  Space,
  Typography,
  message,
  notification,
} from 'antd';
import {
  RobotOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import type { Task } from '../../types/models';
import type { AppRoute } from '../../types/navigation';
import { isTauriApp } from '../../utils/timerPopout';
import { isLocalPath, normalizeLocalPath, browseLocalFolder } from '../../utils/documentLinks';
import { generateGhostDevMasterPrompt } from '../../utils/ghostDevPrompt';
import {
  getGhostDevConfig,
  sanitizeModelId,
  DEFAULT_GHOST_DEV_CONFIG,
} from '../../services/agents/ghostDevConfig';

const { Paragraph } = Typography;

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

export interface RunGhostDevModalProps {
  task: Task | null;
  visible: boolean;
  onCancel: () => void;
  onSuccess?: () => void;
  onNavigate?: ((route: AppRoute) => void) | undefined;
}

export const RunGhostDevModal: React.FC<RunGhostDevModalProps> = ({
  task,
  visible,
  onCancel,
  onSuccess,
  onNavigate,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [detectedPaths, setDetectedPaths] = useState<string[]>([]);
  const [selectedPathMode, setSelectedPathMode] = useState<'detected' | 'custom'>('detected');

  useEffect(() => {
    if (!visible || !task) return;

    // Detect paths from task.documentLinks
    const validPaths: string[] = [];
    if (task.documentLinks && Array.isArray(task.documentLinks)) {
      task.documentLinks.forEach((link) => {
        if (isLocalPath(link)) {
          const clean = normalizeLocalPath(link);
          if (clean && !validPaths.includes(clean)) {
            validPaths.push(clean);
          }
        }
      });
    }

    setDetectedPaths(validPaths);
    const config = getGhostDevConfig();

    if (validPaths.length > 0) {
      setSelectedPathMode('detected');
      form.setFieldsValue({
        repoPath: validPaths[0],
        masterModel: config.masterModel,
        workerModel: config.workerModel,
      });
    } else {
      setSelectedPathMode('custom');
      form.setFieldsValue({
        repoPath: '',
        masterModel: config.masterModel,
        workerModel: config.workerModel,
      });
    }
  }, [visible, task, form]);

  const handleBrowse = async () => {
    const picked = await browseLocalFolder();
    if (picked) {
      form.setFieldValue('repoPath', picked);
      setSelectedPathMode('custom');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!task) return;

      const rawRepoPath = (values.repoPath || '').trim();
      if (!rawRepoPath) {
        message.error('Vui lòng chọn hoặc nhập thư mục làm việc (Repository path).');
        return;
      }

      const repoPath = normalizeLocalPath(rawRepoPath);
      const masterModel = sanitizeModelId(values.masterModel, DEFAULT_GHOST_DEV_CONFIG.masterModel);
      const workerModel = sanitizeModelId(values.workerModel, DEFAULT_GHOST_DEV_CONFIG.workerModel);
      const initialPrompt = generateGhostDevMasterPrompt(task, repoPath);

      setSubmitting(true);

      if (isTauriApp()) {
        await tauriInvoke('start_ghost_dev_session', {
          payload: {
            taskId: task.id,
            taskTitle: task.name,
            repoPath,
            masterModel,
            workerModel,
            initialPrompt,
          },
        });
      } else {
        // Web mode simulation / preview
        console.info('[GhostDev] Simulation start:', {
          taskId: task.id,
          taskTitle: task.name,
          repoPath,
          masterModel,
          workerModel,
        });
      }

      // Feedback per D-03: notification/toast with "Xem trong Agent Control" button
      notification.success({
        message: 'Đã khởi chạy Ghost Dev!',
        description: `Master Agent đang khởi tạo phiên làm việc cho "${task.name}".`,
        duration: 5,
        btn: onNavigate ? (
          <Button
            type="primary"
            size="small"
            icon={<RobotOutlined />}
            onClick={() => {
              notification.destroy();
              onNavigate('agents');
            }}
          >
            Xem trong Agent Control
          </Button>
        ) : undefined,
      });

      onSuccess?.();
      onCancel();
    } catch (err: any) {
      console.error('[GhostDev] Launch failed:', err);
      message.error(err?.message || 'Không thể khởi chạy Ghost Dev session.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!task) return null;

  return (
    <Modal
      open={visible}
      title={
        <Space>
          <RobotOutlined style={{ color: '#4f46e5', fontSize: 18 }} />
          <span>Run Ghost Dev — {task.name}</span>
        </Space>
      }
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={submitting}>
          Hủy
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={<RocketOutlined />}
          style={{ backgroundColor: '#4f46e5' }}
          loading={submitting}
          onClick={handleSubmit}
        >
          Khởi chạy Agent
        </Button>,
      ]}
      width={560}
      destroyOnClose
    >
      <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 13 }}>
        Ghost Dev sẽ tạo một Git worktree riêng biệt (nhánh <code>pm-agent/task-{task.id.slice(0, 8)}</code>) và
        khởi chạy Master Agent điều phối thực hiện tác vụ này.
      </Paragraph>

      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {detectedPaths.length > 0 ? (
          <Form.Item label="Thư mục làm việc (Repository)" required>
            <Radio.Group
              value={selectedPathMode}
              onChange={(e) => setSelectedPathMode(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            >
              <Radio value="detected">Đường dẫn từ tài liệu tác vụ ({detectedPaths.length})</Radio>
              <Radio value="custom">Chọn thư mục khác</Radio>
            </Radio.Group>

            {selectedPathMode === 'detected' ? (
              <Form.Item
                name="repoPath"
                noStyle
                rules={[{ required: true, message: 'Vui lòng chọn thư mục' }]}
              >
                <Select
                  options={detectedPaths.map((p) => ({
                    value: p,
                    label: (
                      <Space>
                        <FolderOutlined style={{ color: '#1677ff' }} />
                        <span>{p}</span>
                      </Space>
                    ),
                  }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            ) : (
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item
                  name="repoPath"
                  noStyle
                  rules={[{ required: true, message: 'Vui lòng nhập hoặc duyệt thư mục' }]}
                >
                  <Input placeholder="/path/to/git-repository" />
                </Form.Item>
                <Button icon={<FolderOpenOutlined />} onClick={handleBrowse}>
                  Duyệt...
                </Button>
              </Space.Compact>
            )}
          </Form.Item>
        ) : (
          <Form.Item
            label="Thư mục làm việc (Git Repository)"
            required
            tooltip="Đường dẫn thư mục chứa repository git cục bộ của tác vụ này"
          >
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item
                name="repoPath"
                noStyle
                rules={[{ required: true, message: 'Vui lòng nhập hoặc duyệt thư mục' }]}
              >
                <Input placeholder="/Users/name/projects/my-app hoặc C:\repo" />
              </Form.Item>
              <Button icon={<FolderOpenOutlined />} onClick={handleBrowse}>
                Duyệt...
              </Button>
            </Space.Compact>
          </Form.Item>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item
            name="masterModel"
            label="Master Agent Model"
            rules={[
              { required: true, message: 'Vui lòng chọn model Master' },
              {
                pattern: /^[a-zA-Z0-9.-]+$/,
                message: 'Model ID chỉ chứa ký tự chữ, số, dấu chấm và gạch ngang',
              },
            ]}
          >
            <Select
              options={[
                { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
                { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
                { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="workerModel"
            label="Worker Agent Model"
            rules={[
              { required: true, message: 'Vui lòng chọn model Worker' },
              {
                pattern: /^[a-zA-Z0-9.-]+$/,
                message: 'Model ID chỉ chứa ký tự chữ, số, dấu chấm và gạch ngang',
              },
            ]}
          >
            <Select
              options={[
                { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
                { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
              ]}
            />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};
