import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Modal,
  Radio,
  message,
} from 'antd';
import {
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  DisconnectOutlined,
  BranchesOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { getJiraApiToken } from '../../services/jiraTokenService';
import type { Task, TaskStatus } from '../../types/models';
import type {
  JiraConfig,
  JiraTransitionItem,
  JiraCachedStatus,
  JiraStatusMapping,
} from '../../services/jira/types';
import {
  getJiraTransitions,
  executeJiraTransition,
  getJiraIssue,
  openJiraExternalUrl,
  getJiraBrowseUrl,
} from '../../services/jira/jiraApi';
import {
  findReachableTransitions,
  isStatusMismatch,
  resolveLocalStatusFromMapping,
} from '../../services/jira/statusMapping';
import { CreateJiraIssueModal } from './CreateJiraIssueModal';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Text, Title, Paragraph } = Typography;

export interface TaskJiraSectionProps {
  task: Task;
  onUpdateTask: (patch: Partial<Task>) => Promise<void>;
  db?: TaskPlannerDatabase | undefined;
}

const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9]+-[0-9]+$/;

const DEFAULT_STATUS_MAPPINGS: JiraStatusMapping = {
  Open: ['10000', '1', 'to do', 'open', 'backlog'],
  'In Progress': ['3', 'in progress'],
  'In Review': ['review', 'code review', 'peer review', 'pr'],
  Resolved: ['resolved', 'testing', 'qa', 'uat', 'verify'],
  Done: ['10001', '10002', 'done', 'closed', 'complete'],
  Cancelled: ['cancelled', "won't do", 'rejected'],
};

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

  // Cached Jira Status state (D-07)
  const [cachedStatus, setCachedStatus] = useState<JiraCachedStatus | null>(null);
  const [loadingJiraStatus, setLoadingJiraStatus] = useState(false);

  // Load Jira settings and custom status mappings from IndexedDB
  const jiraSettings = useLiveQuery(async () => {
    const [domainRec, emailRec, tokenRec, proxyRec, projRec, issueTypeRec, mappingRec] = await Promise.all([
      db.settings.get('jira_domain'),
      db.settings.get('jira_email'),
      getJiraApiToken(db),
      db.settings.get('jira_cors_proxy'),
      db.settings.get('jira_default_project'),
      db.settings.get('jira_default_issue_type'),
      db.settings.get('jira_status_mappings'),
    ]);

    const config: JiraConfig = {
      domain: (domainRec?.value as string) || '',
      email: (emailRec?.value as string) || '',
      apiToken: tokenRec || '',
      corsProxy: (proxyRec?.value as string) || '',
      defaultProjectKey: (projRec?.value as string) || '',
      defaultIssueType: (issueTypeRec?.value as string) || 'Task',
    };

    const mappings = (mappingRec?.value as JiraStatusMapping) || DEFAULT_STATUS_MAPPINGS;

    return { config, mappings };
  }, [db]);

  const config = jiraSettings?.config;
  const mappings = jiraSettings?.mappings || DEFAULT_STATUS_MAPPINGS;

  const [transitions, setTransitions] = useState<JiraTransitionItem[]>([]);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);
  const [loadingTransitions, setLoadingTransitions] = useState(false);
  const [executingTransition, setExecutingTransition] = useState(false);
  const [transitionError, setTransitionError] = useState<{
    message: string;
    isScreenError: boolean;
  } | null>(null);

  // Transition confirmation modal state (D-09)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [matchedTransitions, setMatchedTransitions] = useState<JiraTransitionItem[]>([]);
  const [modalSelectedTransitionId, setModalSelectedTransitionId] = useState<string | null>(null);
  const prevStatusRef = useRef<TaskStatus>(task.status);

  // Refresh Jira Issue & Cached Status on Demand or initial task load (D-12: Zero periodic background polling)
  const fetchJiraIssueStatus = useCallback(async () => {
    if (!task.jiraKey || !config?.domain || !config?.email || !config?.apiToken) {
      return;
    }
    setLoadingJiraStatus(true);
    try {
      const issue = await getJiraIssue(config, task.jiraKey);
      if (issue?.fields?.status) {
        const s = issue.fields.status;
        const nowIso = new Date().toISOString();
        const newCached: JiraCachedStatus = {
          statusId: s.id,
          statusName: s.name,
          statusCategory: s.statusCategory?.name || '',
          syncedAt: nowIso,
        };
        setCachedStatus(newCached);
        await db.settings.put({
          key: `jira_cached_status_${task.id}`,
          value: newCached,
        });
      }
    } catch {
      // Retain existing cached status on refresh failure per UI-SPEC
    } finally {
      setLoadingJiraStatus(false);
    }
  }, [task.jiraKey, task.id, config, db]);

  // Load initial cached status from DB
  useEffect(() => {
    let active = true;
    async function loadCached() {
      const rec = await db.settings.get(`jira_cached_status_${task.id}`);
      if (active && rec?.value) {
        setCachedStatus(rec.value as JiraCachedStatus);
      }
    }
    void loadCached();
    return () => {
      active = false;
    };
  }, [task.id, db]);

  const fetchTransitions = useCallback(async () => {
    if (!task.jiraKey || !config?.domain || !config?.email || !config?.apiToken) {
      return [];
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
      return list;
    } catch (err: unknown) {
      setTransitions([]);
      setSelectedTransitionId(null);
      const msg =
        err instanceof Error ? err.message : 'Không thể tải workflow transitions từ Jira.';
      setTransitionError({ message: msg, isScreenError: false });
      return [];
    } finally {
      setLoadingTransitions(false);
    }
  }, [task.jiraKey, config]);

  // Refresh data on task mount (D-12)
  useEffect(() => {
    if (task.jiraKey && config?.domain && config?.apiToken) {
      void fetchJiraIssueStatus();
      void fetchTransitions();
    } else {
      setTransitions([]);
      setSelectedTransitionId(null);
      setTransitionError(null);
    }
  }, [task.jiraKey, config, fetchJiraIssueStatus, fetchTransitions]);

  // Status transition detection when local status changes (D-08, D-09, D-10)
  useEffect(() => {
    if (prevStatusRef.current !== task.status) {
      prevStatusRef.current = task.status;

      // Only prompt if Jira is linked
      if (task.jiraKey && config?.domain && config?.apiToken) {
        void (async () => {
          const avail = await fetchTransitions();
          const reachable = findReachableTransitions(avail, task.status, mappings);
          if (reachable.length > 0) {
            setMatchedTransitions(reachable);
            setModalSelectedTransitionId(reachable[0]!.id);
            setConfirmModalOpen(true);
          } else {
            // D-10: No mapped transition reachable -> preserve local status, surface mismatch
            message.info(
              `Trạng thái cục bộ đã đổi sang "${task.status}". Không có luồng chuyển Jira tương ứng hoặc không khả dụng.`
            );
          }
        })();
      }
    }
  }, [task.status, task.jiraKey, config, mappings, fetchTransitions]);

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
      setCachedStatus(null);
      await db.settings.delete(`jira_cached_status_${task.id}`);
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

  const executeTransitionId = async (transId: string) => {
    if (!transId || !task.jiraKey || !config) return;

    setExecutingTransition(true);
    setTransitionError(null);

    const chosen = transitions.find((t) => t.id === transId);

    try {
      await executeJiraTransition(config, task.jiraKey, transId);

      // If transition succeeds, update cached Jira status
      if (chosen) {
        const nowIso = new Date().toISOString();
        const updatedCache: JiraCachedStatus = {
          statusId: chosen.to.id,
          statusName: chosen.to.name,
          statusCategory: chosen.to.statusCategory?.name || '',
          syncedAt: nowIso,
        };
        setCachedStatus(updatedCache);
        await db.settings.put({
          key: `jira_cached_status_${task.id}`,
          value: updatedCache,
        });

        // Optionally align local status if not already aligned
        const resolvedLocal = resolveLocalStatusFromMapping(chosen.to.id, mappings);
        if (resolvedLocal && resolvedLocal !== task.status) {
          await onUpdateTask({ status: resolvedLocal });
        }
      }

      message.success('Đã chuyển trạng thái Jira thành công');
      announceToScreenReader('Đã chuyển trạng thái tác vụ Jira thành công');
      void fetchTransitions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi chuyển trạng thái Jira.';
      const hasScreen = isScreenError(msg) || Boolean(chosen?.hasScreen);

      // D-10: Retain local status change on transition error, report mismatch
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

  const handleExecuteTransition = async () => {
    if (selectedTransitionId) {
      await executeTransitionId(selectedTransitionId);
    }
  };

  const handleConfirmModalOk = async () => {
    if (modalSelectedTransitionId) {
      setConfirmModalOpen(false);
      await executeTransitionId(modalSelectedTransitionId);
    }
  };

  // Status mismatch evaluation (D-07, D-10)
  const hasMismatch = isStatusMismatch(task.status, cachedStatus?.statusId, mappings);
  const browseUrl = task.jiraKey ? getJiraBrowseUrl(task.jiraKey, config?.domain) : '';

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
                  void openJiraExternalUrl(browseUrl);
                }}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void openJiraExternalUrl(browseUrl);
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

          {/* Cached Jira Status & Reconciliation Display (D-07, D-10, D-12) */}
          <div
            style={{
              backgroundColor: '#fafafa',
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid #f0f0f0',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={6}>
                <Text strong style={{ fontSize: 13 }}>
                  Trạng thái Jira:
                </Text>
                {cachedStatus ? (
                  <Tag color="geekblue" style={{ margin: 0 }}>
                    {cachedStatus.statusName}
                  </Tag>
                ) : (
                  <Tag color="default" style={{ margin: 0 }}>
                    Chưa refresh
                  </Tag>
                )}

                {hasMismatch && cachedStatus && (
                  <Tag color="warning" icon={<WarningOutlined />} style={{ margin: 0 }}>
                    Lệch trạng thái
                  </Tag>
                )}
              </Space>

              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                loading={loadingJiraStatus}
                onClick={() => void fetchJiraIssueStatus()}
                aria-label="Làm mới Jira"
              >
                Làm mới Jira
              </Button>
            </div>

            {hasMismatch && cachedStatus && (
              <Alert
                type="warning"
                showIcon
                message={
                  <span>
                    Trạng thái tác vụ trong app (<strong>{task.status}</strong>) khác với Jira (
                    <strong>{cachedStatus.statusName}</strong>).
                  </span>
                }
                action={
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      void openJiraExternalUrl(browseUrl);
                    }}
                  >
                    Mở trên Jira
                  </Button>
                }
                style={{ marginTop: 4 }}
              />
            )}
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
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      void openJiraExternalUrl(browseUrl);
                    }}
                  >
                    Mở trên Jira Web
                  </Button>
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

      {/* Confirmation Modal when local status changes (D-09) */}
      <Modal
        title="Xác nhận đồng bộ trạng thái sang Jira"
        open={confirmModalOpen}
        onOk={() => void handleConfirmModalOk()}
        onCancel={() => setConfirmModalOpen(false)}
        okText="Đồng bộ sang Jira"
        cancelText="Để sau"
      >
        <Paragraph>
          Tác vụ cục bộ đã chuyển sang trạng thái <strong>{task.status}</strong>. Có{' '}
          {matchedTransitions.length} luồng chuyển Jira tương ứng. Bạn có muốn chuyển trạng thái
          trên Jira Board luôn không?
        </Paragraph>

        {matchedTransitions.length === 1 ? (
          <Alert
            type="info"
            message={
              <span>
                Luồng chuyển Jira sẽ thực hiện:{' '}
                <strong>{matchedTransitions[0]?.name}</strong>
              </span>
            }
            showIcon
          />
        ) : (
          <Radio.Group
            value={modalSelectedTransitionId}
            onChange={(e) => setModalSelectedTransitionId(e.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
          >
            {matchedTransitions.map((t) => (
              <Radio key={t.id} value={t.id}>
                {t.name} (Đích: {t.to.name})
              </Radio>
            ))}
          </Radio.Group>
        )}
      </Modal>

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
