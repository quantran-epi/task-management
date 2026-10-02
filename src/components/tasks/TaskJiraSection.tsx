import React, { useState, useEffect, useCallback } from 'react';
import {
  Space,
  Button,
  Input,
  Tag,
  Select,
  Popconfirm,
  Alert,
  Typography,
  Spin,
  message,
} from 'antd';
import {
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  DisconnectOutlined,
  BranchesOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import type { Task } from '../../types/models';
import type { JiraConfig, JiraTransitionItem } from '../../services/jira/types';
import { getJiraTransitions, executeJiraTransition } from '../../services/jira/jiraApi';
import {
  mapJiraStatusToLocalTaskStatus,
  normalizeJiraStatusMappings,
} from '../../services/jira/statusMapping';
import { CreateJiraIssueModal } from './CreateJiraIssueModal';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Text, Title } = Typography;

export interface TaskJiraSectionProps {
  task: Task;
  onUpdateTask: (patch: Partial<Task>) => Promise<void>;
  db?: TaskPlannerDatabase | undefined;
}

const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9]+-[0-9]+$/;

export const TaskJiraSection: React.FC<TaskJiraSectionProps> = ({
  task,
  onUpdateTask,
  db = defaultDb,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  // Load Jira settings from IndexedDB
  const config: JiraConfig | undefined = useLiveQuery(async () => {
    const [domainRec, emailRec, tokenRec, proxyRec, projRec, issueTypeRec, mappingRec] =
      await Promise.all([
        db.settings.get('jira_domain'),
        db.settings.get('jira_email'),
        db.settings.get('jira_api_token'),
        db.settings.get('jira_cors_proxy'),
        db.settings.get('jira_default_project'),
        db.settings.get('jira_default_issue_type'),
        db.settings.get('jira_status_mappings'),
      ]);
    normalizeJiraStatusMappings(mappingRec?.value);
    return {
      domain: (domainRec?.value as string) || '',
      email: (emailRec?.value as string) || '',
      apiToken: (tokenRec?.value as string) || '',
      corsProxy: (proxyRec?.value as string) || '',
      defaultProjectKey: (projRec?.value as string) || '',
      defaultIssueType: (issueTypeRec?.value as string) || 'Task',
    };
  }, [db]);

  const [transitions, setTransitions] = useState<JiraTransitionItem[]>([]);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);
  const [loadingTransitions, setLoadingTransitions] = useState(false);
  const [executingTransition, setExecutingTransition] = useState(false);
  const [transitionError, setTransitionError] = useState<{
    message: string;
    isScreenError: boolean;
  } | null>(null);

  const getBrowseUrl = useCallback(
    (key: string): string => {
      const rawDomain = (config?.domain || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const domainHost = rawDomain.includes('.')
        ? rawDomain
        : rawDomain
          ? `${rawDomain}.atlassian.net`
          : 'atlassian.net';
      return `https://${domainHost}/browse/${key}`;
    },
    [config?.domain]
  );

  const fetchTransitions = useCallback(async () => {
    if (!task.jiraKey || !config?.domain || !config?.email || !config?.apiToken) {
      return;
    }
    setLoadingTransitions(true);
    setTransitionError(null);
    try {
      const data = await getJiraTransitions(config, task.jiraKey);
      const list = data.transitions || [];
      setTransitions(list);
      if (list.length > 0) {
        setSelectedTransitionId(list[0]!.id);
      } else {
        setSelectedTransitionId(null);
      }
    } catch (err: unknown) {
      setTransitions([]);
      setSelectedTransitionId(null);
      const msg =
        err instanceof Error ? err.message : 'Không thể tải workflow transitions từ Jira.';
      setTransitionError({ message: msg, isScreenError: false });
    } finally {
      setLoadingTransitions(false);
    }
  }, [task.jiraKey, config]);

  useEffect(() => {
    if (task.jiraKey && config?.domain && config?.apiToken) {
      void fetchTransitions();
    } else {
      setTransitions([]);
      setSelectedTransitionId(null);
      setTransitionError(null);
    }
  }, [task.jiraKey, config, fetchTransitions]);

  const handleLinkKey = async () => {
    const trimmed = manualKey.trim().toUpperCase();
    if (!JIRA_KEY_REGEX.test(trimmed)) {
      setKeyError('Mã Jira Key không hợp lệ. Ví dụ đúng: SHB-1234');
      return;
    }

    setKeyError(null);
    setLinking(true);
    try {
      await onUpdateTask({ jiraKey: trimmed });
      message.success(`Đã liên kết mã Jira ${trimmed}`);
      announceToScreenReader(`Đã liên kết mã Jira ${trimmed}`);
      setManualKey('');
    } catch {
      message.error('Không thể liên kết mã Jira.');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      await onUpdateTask({ jiraKey: undefined });
      message.success('Đã hủy liên kết Jira');
      announceToScreenReader('Đã hủy liên kết Jira');
    } catch {
      message.error('Không thể hủy liên kết Jira.');
    } finally {
      setUnlinking(false);
    }
  };

  const handleCreateSuccess = async (createdKey: string) => {
    await onUpdateTask({ jiraKey: createdKey });
    setModalOpen(false);
  };

  const isScreenError = (errorMsg: string): boolean => {
    const lower = errorMsg.toLowerCase();
    return (
      lower.includes('screen') ||
      lower.includes('resolution') ||
      lower.includes('màn hình') ||
      lower.includes('bắt buộc') ||
      lower.includes('required') ||
      lower.includes('fields')
    );
  };

  const handleExecuteTransition = async () => {
    if (!selectedTransitionId || !task.jiraKey || !config) return;

    setExecutingTransition(true);
    setTransitionError(null);

    const chosen = transitions.find((t) => t.id === selectedTransitionId);

    try {
      await executeJiraTransition(config, task.jiraKey, selectedTransitionId);

      if (chosen) {
        const newStatus = mapJiraStatusToLocalTaskStatus(
          chosen.to.name,
          chosen.to.statusCategory?.key
        );
        if (newStatus) {
          await onUpdateTask({ status: newStatus });
        }
      }

      message.success('Đã chuyển trạng thái Jira thành công');
      announceToScreenReader('Đã chuyển trạng thái tác vụ Jira thành công');
      void fetchTransitions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi chuyển trạng thái Jira.';
      const hasScreen = isScreenError(msg) || Boolean(chosen?.hasScreen);

      if (hasScreen) {
        setTransitionError({
          message:
            'Không thể chuyển trạng thái trực tiếp do workflow Jira yêu cầu nhập màn hình (Screen/Resolution). Vui lòng thực hiện trên Jira Web.',
          isScreenError: true,
        });
      } else {
        setTransitionError({
          message: msg,
          isScreenError: false,
        });
      }
    } finally {
      setExecutingTransition(false);
    }
  };

  return (
    <div data-testid="task-jira-section" style={{ marginTop: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Title level={5} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BranchesOutlined style={{ color: '#1677ff' }} />
          <span>Tích hợp Jira Cloud</span>
        </Title>
      </div>

      {!task.jiraKey ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Tác vụ chưa được liên kết với Jira Issue nào.
          </Text>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalOpen(true)}
              aria-label="Tạo Jira Issue mới"
            >
              Tạo Jira Issue mới
            </Button>
          </div>

          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Hoặc gắn mã Jira Issue có sẵn:
            </Text>
            <Space.Compact style={{ width: '100%', maxWidth: 300 }}>
              <Input
                placeholder="SHB-1234"
                value={manualKey}
                onChange={(e) => {
                  setManualKey(e.target.value.toUpperCase());
                  setKeyError(null);
                }}
                status={keyError ? 'error' : ''}
                aria-label="Nhập Jira Key"
                onPressEnter={() => void handleLinkKey()}
              />
              <Button type="default" onClick={() => void handleLinkKey()} loading={linking}>
                Gắn Jira Key
              </Button>
            </Space.Compact>
            {keyError && (
              <div style={{ marginTop: 4 }}>
                <Text type="danger" style={{ fontSize: 12 }}>
                  {keyError}
                </Text>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header row with Jira key badge and Unlink button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#fafafa',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #f0f0f0',
            }}
          >
            <Space align="center" size={8}>
              <Text strong style={{ fontSize: 13 }}>
                Jira Issue:
              </Text>
              <Tag
                color="processing"
                style={{
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: '2px 8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  margin: 0,
                }}
                onClick={() => {
                  window.open(getBrowseUrl(task.jiraKey!), '_blank', 'noopener,noreferrer');
                }}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    window.open(getBrowseUrl(task.jiraKey!), '_blank', 'noopener,noreferrer');
                  }
                }}
              >
                <span>{task.jiraKey}</span>
                <LinkOutlined />
              </Tag>
            </Space>

            <Popconfirm
              title="Hủy liên kết Jira"
              description={`Hủy liên kết: Bạn có chắc chắn muốn gỡ liên kết Jira Key ${task.jiraKey} khỏi tác vụ này? (Issue trên Jira vẫn được giữ nguyên).`}
              okText="Hủy liên kết"
              cancelText="Không"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleUnlink()}
            >
              <Button
                danger
                size="small"
                icon={<DisconnectOutlined />}
                loading={unlinking}
                aria-label="Hủy liên kết Jira"
              >
                Hủy liên kết
              </Button>
            </Popconfirm>
          </div>

          {/* Workflow transitions */}
          <div
            style={{
              backgroundColor: '#fafafa',
              padding: '12px',
              borderRadius: 6,
              border: '1px solid #f0f0f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Text strong style={{ fontSize: 13 }}>
                Chuyển trạng thái Jira (Workflow Transition)
              </Text>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => void fetchTransitions()}
                loading={loadingTransitions}
                aria-label="Làm mới transitions"
              />
            </div>

            {transitionError && (
              <Alert
                type={transitionError.isScreenError ? 'warning' : 'error'}
                showIcon
                message={transitionError.message}
                action={
                  transitionError.isScreenError ? (
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => {
                        window.open(getBrowseUrl(task.jiraKey!), '_blank', 'noopener,noreferrer');
                      }}
                    >
                      Mở trên Jira Web
                    </Button>
                  ) : undefined
                }
                closable
                onClose={() => setTransitionError(null)}
                style={{ marginBottom: 10 }}
              />
            )}

            {loadingTransitions ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <Spin size="small" />
              </div>
            ) : transitions.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
                Không có luồng chuyển trạng thái nào khả dụng từ trạng thái hiện tại.
              </Text>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                  value={selectedTransitionId}
                  onChange={(val) => setSelectedTransitionId(val)}
                  options={transitions.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="Chọn luồng chuyển trạng thái..."
                  style={{ flex: 1 }}
                  aria-label="Chọn transition"
                />
                <Button
                  type="primary"
                  onClick={() => void handleExecuteTransition()}
                  loading={executingTransition}
                  disabled={!selectedTransitionId}
                >
                  Thực hiện chuyển trạng thái
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateJiraIssueModal
        open={modalOpen}
        task={task}
        onClose={() => setModalOpen(false)}
        onSuccess={(newKey) => void handleCreateSuccess(newKey)}
        db={db}
      />
    </div>
  );
};
