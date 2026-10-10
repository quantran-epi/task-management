import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudOutlined,
  DatabaseOutlined,
  EditOutlined,
  EyeOutlined,
  LeftOutlined,
  LoadingOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  List,
  Modal,
  Progress,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../../db';
import type { DocumentSet, Note, PublishAttemptCache, PublishPrimaryState } from '../../types/models';
import { AttemptHistoryList } from './AttemptHistoryList';
import { DocumentSetForm, type DocumentSetFormValue } from './DocumentSetForm';
import { GraphEvidenceDrawer } from './GraphEvidenceDrawer';
import {
  createKnowledgeClient,
  type GraphBuildStage,
  type GraphState,
  type GraphStatusResponse,
  type KnowledgeClient,
} from '../../services/knowledge/knowledgeClient';
import { useOptionalKnowledgeConfig } from '../../services/knowledge/knowledgeConfig';
import { generateId } from '../../utils/uuid';

const { Text, Title, Paragraph } = Typography;

const STATE_UI = {
  'Never published': { label: 'Chưa xuất bản', icon: <CloudOutlined />, color: 'default' },
  'In sync': { label: 'Đã đồng bộ', icon: <CheckCircleOutlined />, color: 'success' },
  'Local changes': { label: 'Có thay đổi cục bộ', icon: <EditOutlined />, color: 'processing' },
  Publishing: { label: 'Đang xuất bản', icon: <LoadingOutlined spin />, color: 'processing' },
  Warning: { label: 'Cảnh báo', icon: <WarningOutlined />, color: 'warning' },
  Failed: { label: 'Thất bại', icon: <CloseCircleOutlined />, color: 'error' },
} as const;

export function publishStateLabel(state: PublishPrimaryState): string {
  return STATE_UI[state].label;
}

const GRAPH_STATE_UI: Record<GraphState, { label: string; color: string; icon: React.ReactNode }> = {
  'Never built': { label: 'Chưa xây dựng', color: 'default', icon: <CloudOutlined /> },
  Building: { label: 'Đang xây dựng', color: 'processing', icon: <LoadingOutlined spin /> },
  Active: { label: 'Đang hoạt động', color: 'success', icon: <CheckCircleOutlined /> },
  'Active with warnings': { label: 'Hoạt động có cảnh báo', color: 'warning', icon: <WarningOutlined /> },
  Failed: { label: 'Thất bại', color: 'error', icon: <CloseCircleOutlined /> },
};

const STAGE_LABELS: Record<GraphBuildStage, string> = {
  Preparing: 'Chuẩn bị',
  'Structured extraction': 'Trích xuất có cấu trúc',
  'Prose extraction': 'Trích xuất văn xuôi',
  Validation: 'Kiểm tra',
  Activation: 'Kích hoạt',
};

const STAGE_PROGRESS: Record<GraphBuildStage, number> = {
  Preparing: 20,
  'Structured extraction': 40,
  'Prose extraction': 60,
  Validation: 80,
  Activation: 100,
};

export interface DocumentSetDrawerProps {
  open: boolean;
  sets?: readonly DocumentSet[];
  notes?: readonly Note[];
  attempts?: readonly PublishAttemptCache[];
  selectedSetId?: string;
  state?: PublishPrimaryState;
  statesBySet?: Readonly<Record<string, PublishPrimaryState>>;
  activeAttemptIdsBySet?: Readonly<Record<string, string>>;
  reconcilingAttemptId?: string;
  reconciliationErrorsBySet?: Readonly<Record<string, string>>;
  activeSetId?: string;
  activeSummary?: string;
  cachedAt?: string;
  offline?: boolean;
  configured: boolean;
  loading?: boolean;
  currentFolderId?: string;
  creating?: boolean;
  onClose: () => void;
  onSave: (setId: string | undefined, value: DocumentSetFormValue) => void | Promise<void>;
  onPreview: (set: DocumentSet) => void;
  onReconcileAttempt?: (setId: string, attemptId: string) => void | Promise<void>;
  onCreate?: () => void;
  onCancelCreate?: () => void;
  onOpenSettings?: () => void;
  // Injected for test isolation
  knowledgeClient?: KnowledgeClient;
  graphStatusOverride?: GraphStatusResponse;
}

export function DocumentSetDrawer(props: DocumentSetDrawerProps) {
  const { token } = theme.useToken();
  const config = useOptionalKnowledgeConfig();
  const queriedSets = useLiveQuery(() => db.documentSets.toArray(), []);
  const queriedNotes = useLiveQuery(() => db.notes.toArray(), []);
  const queriedAttempts = useLiveQuery(() => db.publishAttempts.toArray(), []);
  const liveSets = props.sets ? [...props.sets] : queriedSets;
  const liveNotes = props.notes ? [...props.notes] : queriedNotes;
  const liveAttempts = props.attempts ? [...props.attempts] : queriedAttempts;
  const [internalSelectedId, setInternalSelectedId] = useState<string>();
  const [internalCreating, setInternalCreating] = useState(false);
  const isCreating = props.creating ?? internalCreating;

  // Graph state & inspection
  const [graphStatus, setGraphStatus] = useState<GraphStatusResponse | undefined>(props.graphStatusOverride);
  const [graphLoading, setGraphLoading] = useState(false);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  const [connectivityUncertain, setConnectivityUncertain] = useState(false);

  const client = useMemo<KnowledgeClient | undefined>(
    () =>
      props.knowledgeClient ??
      (props.configured && config.baseUrl && config.token
        ? createKnowledgeClient({ baseUrl: config.baseUrl, token: config.token })
        : undefined),
    [props.knowledgeClient, props.configured, config.baseUrl, config.token]
  );

  const handleCreate = () => {
    setInternalSelectedId(undefined);
    if (props.onCreate) {
      props.onCreate();
    } else {
      setInternalCreating(true);
    }
  };

  const handleCancelCreate = () => {
    if (props.onCancelCreate) {
      props.onCancelCreate();
    } else {
      setInternalCreating(false);
    }
  };

  const selectedId = props.selectedSetId ?? internalSelectedId;
  const selected = !isCreating ? liveSets?.find((set) => set.id === selectedId) : undefined;
  const stateForSet = (setId: string): PublishPrimaryState =>
    props.statesBySet?.[setId] ?? (setId === selectedId ? props.state : undefined) ?? 'Never published';
  const state = selected ? stateForSet(selected.id) : 'Never published';
  const stateUi = STATE_UI[state];
  const activeAttemptId = selected ? props.activeAttemptIdsBySet?.[selected.id] : undefined;
  const previewDisabled = !selected?.documentIds.length || !props.configured || props.activeSetId === selected?.id || state === 'Publishing';

  // Fetch graph status when selected set changes
  useEffect(() => {
    if (props.graphStatusOverride) {
      setGraphStatus(props.graphStatusOverride);
      return;
    }
    if (!selected?.id || !client || !props.open) {
      setGraphStatus(undefined);
      return;
    }

    let active = true;
    setGraphLoading(true);
    setConnectivityUncertain(false);

    client
      .getGraphStatus(selected.id)
      .then((res) => {
        if (!active) return;
        setGraphStatus(res);
      })
      .catch((err) => {
        if (!active) return;
        if (err?.code === 'NETWORK_ERROR') {
          setConnectivityUncertain(true);
        }
      })
      .finally(() => {
        if (active) setGraphLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selected?.id, client, props.open, props.graphStatusOverride]);

  const handleTriggerRebuild = async () => {
    if (!selected?.id || !client) return;
    setRebuildConfirmOpen(false);
    setRebuilding(true);
    setConnectivityUncertain(false);

    const rebuildKey = generateId();

    try {
      await client.triggerGraphRebuild(selected.id, rebuildKey);
      message.info('Đã bắt đầu xây dựng lại đồ thị tri thức.');

      // Poll until completed or failed
      const finalStatus = await client.pollGraphStatus(selected.id);
      setGraphStatus(finalStatus);
      if (finalStatus.state === 'Failed') {
        message.error(
          finalStatus.error?.message ?? 'Xây dựng đồ thị tri thức thất bại.'
        );
      } else if (finalStatus.uncertain) {
        setConnectivityUncertain(true);
        message.warning('Mất kết nối — chưa xác định kết quả xây dựng đồ thị.');
      } else {
        message.success('Xây dựng đồ thị tri thức hoàn tất.');
      }
    } catch (err: any) {
      if (err?.code === 'NETWORK_ERROR') {
        setConnectivityUncertain(true);
      } else {
        message.error(err instanceof Error ? err.message : 'Xây dựng lại đồ thị thất bại.');
      }
    } finally {
      setRebuilding(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!selected?.id || !client) return;
    setGraphLoading(true);
    setConnectivityUncertain(false);
    try {
      const res = await client.getGraphStatus(selected.id);
      setGraphStatus(res);
    } catch (err: any) {
      if (err?.code === 'NETWORK_ERROR') {
        setConnectivityUncertain(true);
      } else {
        message.error('Không thể kiểm tra trạng thái đồ thị.');
      }
    } finally {
      setGraphLoading(false);
    }
  };

  // Rebuild button enable conditions per D-18 / UI spec:
  // Enabled only when active published snapshot exists, daemon reachable, no rebuild in progress
  const hasPublishedSnapshot = state === 'In sync' || state === 'Local changes' || state === 'Warning';
  const isBuilding = rebuilding || graphStatus?.state === 'Building';
  const rebuildDisabled = !hasPublishedSnapshot || !props.configured || isBuilding || !client;

  const currentGraphState = graphStatus?.state ?? 'Never built';
  const currentGraphUi = GRAPH_STATE_UI[currentGraphState];

  return (
    <>
      <Drawer
        open={props.open}
        onClose={props.onClose}
        width={520}
        styles={{ body: { background: token.colorBgContainer, padding: token.padding } }}
        title={isCreating ? 'Tạo bộ tài liệu mới' : 'Bộ tài liệu xuất bản'}
        extra={!isCreating ? <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Tạo bộ tài liệu</Button> : null}
      >
        <Text type="secondary">
          {isCreating
            ? 'Tạo nhóm tài liệu từ thư mục hiện tại hoặc chọn thủ công để chuẩn bị xuất bản.'
            : 'Quản lý nhóm tài liệu gửi thủ công đến Knowledge Server.'}
        </Text>
        <div style={{ marginTop: token.margin }}>
          {props.loading || !liveSets || !liveNotes || !liveAttempts ? (
            <Skeleton active />
          ) : isCreating ? (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Button type="text" icon={<LeftOutlined />} onClick={handleCancelCreate}>
                Hủy tạo / Quay lại danh sách
              </Button>
              <DocumentSetForm
                notes={liveNotes}
                {...(props.currentFolderId ? { currentFolderId: props.currentFolderId } : {})}
                onSave={async (value) => {
                  await props.onSave(undefined, value);
                  handleCancelCreate();
                }}
              />
            </Space>
          ) : !selected ? (
            liveSets.length === 0 ? (
              <Empty
                description={
                  <Space direction="vertical">
                    <Title level={3}>Chưa có bộ tài liệu</Title>
                    <Text>Tạo một bộ từ thư mục hiện tại hoặc chọn tài liệu thủ công để xuất bản lên Knowledge Server.</Text>
                    <Button type="primary" onClick={handleCreate}>Tạo bộ tài liệu</Button>
                  </Space>
                }
              />
            ) : (
              <List
                dataSource={liveSets}
                renderItem={(set) => {
                  const rowState = stateForSet(set.id);
                  const rowStateUi = STATE_UI[rowState];
                  return (
                    <List.Item actions={[<Button key="open" onClick={() => setInternalSelectedId(set.id)}>Mở chi tiết</Button>]}>
                      <List.Item.Meta title={<Tooltip title={set.name}>{set.name}</Tooltip>} description={`${set.documentIds.length} tài liệu`} />
                      <Tooltip title={rowStateUi.label}>
                        <Tag color={rowStateUi.color} icon={rowStateUi.icon}>{rowStateUi.label}</Tag>
                      </Tooltip>
                    </List.Item>
                  );
                }}
              />
            )
          ) : (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Button type="text" icon={<LeftOutlined />} onClick={() => setInternalSelectedId(undefined)}>Danh sách bộ tài liệu</Button>
              <Space wrap>
                <Tooltip title={stateUi.label}><Tag color={stateUi.color} icon={stateUi.icon}>{stateUi.label}</Tag></Tooltip>
                {props.activeSummary && <Text>{props.activeSummary}</Text>}
              </Space>
              {props.offline && props.cachedAt && <Alert type="warning" showIcon message={`Dữ liệu trạng thái gần nhất: ${props.cachedAt}`} description="Không thể tải trạng thái từ Knowledge Server. Bạn vẫn có thể chỉnh sửa và tìm kiếm tài liệu cục bộ. Kiểm tra kết nối rồi thử lại." />}
              {!props.configured && <Alert type="info" showIcon message="Chưa cấu hình Knowledge Server." action={<Button onClick={props.onOpenSettings}>Mở cài đặt</Button>} />}
              {selected && props.reconciliationErrorsBySet?.[selected.id] && (
                <Alert type="error" showIcon message={props.reconciliationErrorsBySet[selected.id]} />
              )}
              {state === 'Publishing' && activeAttemptId && props.onReconcileAttempt && (
                <Button
                  loading={props.reconcilingAttemptId === activeAttemptId}
                  disabled={!props.configured || props.reconcilingAttemptId === activeAttemptId}
                  onClick={() => props.onReconcileAttempt?.(selected.id, activeAttemptId)}
                >
                  Kiểm tra trạng thái
                </Button>
              )}
              <DocumentSetForm
                notes={liveNotes}
                initialSet={selected}
                {...(props.currentFolderId ? { currentFolderId: props.currentFolderId } : {})}
                onSave={(value) => props.onSave(selected.id, value)}
              />
              <Button aria-label="Xem trước xuất bản" type="primary" disabled={previewDisabled} onClick={() => props.onPreview(selected)}>Xem trước xuất bản</Button>

              {/* Section: Đồ thị tri thức (Knowledge Graph) */}
              <section aria-labelledby="knowledge-graph-heading">
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Title level={3} id="knowledge-graph-heading" style={{ margin: 0 }}>
                      <DatabaseOutlined style={{ marginRight: 8 }} />
                      Đồ thị tri thức
                    </Title>
                    <Tooltip title={currentGraphUi.label}>
                      <Tag color={currentGraphUi.color} icon={currentGraphUi.icon}>
                        {currentGraphUi.label}
                      </Tag>
                    </Tooltip>
                  </Space>

                  {connectivityUncertain && (
                    <Alert
                      type="warning"
                      showIcon
                      message="Mất kết nối với Knowledge Server"
                      description="Không thể đồng bộ trạng thái đồ thị mới nhất. Đồ thị đang hoạt động trước đó vẫn được bảo toàn nguyên vẹn."
                    />
                  )}

                  {graphStatus?.state === 'Failed' && (
                    <Alert
                      type="error"
                      showIcon
                      message={
                        graphStatus.error?.code
                          ? `Xây dựng thất bại: ${graphStatus.error.code}`
                          : 'Xây dựng đồ thị thất bại'
                      }
                      description={
                        graphStatus.error?.message ??
                        'Đồ thị tri thức chưa thể tạo. Kiểm tra tài liệu đã xuất bản rồi bấm Xây dựng lại đồ thị.'
                      }
                    />
                  )}

                  {/* Summary card */}
                  <Card size="small" bordered style={{ background: token.colorBgContainer }}>
                    {graphLoading ? (
                      <Skeleton active paragraph={{ rows: 3 }} />
                    ) : (
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        {isBuilding && (
                          <div style={{ marginBottom: token.marginXS }}>
                            <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                              <Text strong>
                                Giai đoạn: {STAGE_LABELS[graphStatus?.currentStage ?? 'Preparing']}
                              </Text>
                              <Text type="secondary">Ứng viên riêng biệt</Text>
                            </Space>
                            <Progress
                              percent={STAGE_PROGRESS[graphStatus?.currentStage ?? 'Preparing']}
                              status="active"
                              size="small"
                            />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Đồ thị đang hoạt động trước đó vẫn khả dụng cho đến khi ứng viên hoàn tất.
                            </Text>
                          </div>
                        )}

                        <Descriptions size="small" column={1}>
                          <Descriptions.Item label="Snapshot đồ thị">
                            {graphStatus?.activeGraphSnapshotId ? (
                              <Text code copyable={{ text: graphStatus.activeGraphSnapshotId }}>
                                {graphStatus.activeGraphSnapshotId.slice(0, 8)}...
                              </Text>
                            ) : (
                              <Text type="secondary">Chưa có</Text>
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label="Phiên bản Ontology">
                            <Text code>{graphStatus?.ontologyVersion ?? '2026.10.1'}</Text>
                          </Descriptions.Item>
                          {graphStatus?.activatedAt && (
                            <Descriptions.Item label="Kích hoạt lúc">
                              <Text>{new Date(graphStatus.activatedAt).toLocaleString()}</Text>
                            </Descriptions.Item>
                          )}
                        </Descriptions>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
                          <Statistic title="Thực thể" value={graphStatus?.nodeCount ?? 0} />
                          <Statistic title="Sự kiện" value={graphStatus?.factCount ?? 0} />
                          <Statistic title="Dẫn chứng" value={graphStatus?.evidenceCount ?? 0} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                          <Statistic
                            title="Mâu thuẫn"
                            value={graphStatus?.conflictCount ?? 0}
                            valueStyle={{ color: (graphStatus?.conflictCount ?? 0) > 0 ? token.colorError : undefined }}
                          />
                          <Statistic
                            title="Cách ly"
                            value={graphStatus?.quarantineCount ?? 0}
                            valueStyle={{ color: (graphStatus?.quarantineCount ?? 0) > 0 ? token.colorWarning : undefined }}
                          />
                        </div>
                      </Space>
                    )}
                  </Card>

                  {/* Actions */}
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<ReloadOutlined />}
                      loading={isBuilding}
                      disabled={rebuildDisabled}
                      onClick={() => setRebuildConfirmOpen(true)}
                    >
                      {isBuilding ? 'Đang xây dựng đồ thị' : 'Xây dựng lại đồ thị'}
                    </Button>

                    <Button
                      icon={<EyeOutlined />}
                      disabled={!graphStatus?.activeGraphSnapshotId}
                      onClick={() => setEvidenceDrawerOpen(true)}
                    >
                      Xem bằng chứng
                    </Button>

                    <Button
                      icon={<ReloadOutlined />}
                      disabled={!props.configured}
                      onClick={handleRefreshStatus}
                    >
                      Kiểm tra trạng thái
                    </Button>
                  </Space>
                </Space>
              </section>

              <section aria-labelledby="attempt-history-heading">
                <Title level={3} id="attempt-history-heading">Lịch sử xuất bản</Title>
                <AttemptHistoryList attempts={liveAttempts.filter((attempt) => attempt.setId === selected.id)} />
              </section>
            </Space>
          )}
        </div>
      </Drawer>

      {/* Confirmation modal before rebuild per D-21 */}
      <Modal
        open={rebuildConfirmOpen}
        title="Xác nhận xây dựng lại đồ thị tri thức"
        onCancel={() => setRebuildConfirmOpen(false)}
        onOk={handleTriggerRebuild}
        okText="Bắt đầu xây dựng"
        cancelText="Hủy"
      >
        <Space direction="vertical" orientation="vertical" size="small" style={{ width: '100%' }}>
          <Paragraph>
            Hành động này sẽ kích hoạt quá trình trích xuất và tổng hợp toàn bộ tri thức từ bản chụp Markdown đã xuất bản gần nhất trên Knowledge Server.
          </Paragraph>
          <Alert
            type="info"
            showIcon
            message="Tính toàn vẹn và nguyên tử"
            description="Đồ thị mới được xây dựng trong một ứng viên riêng biệt. Đồ thị đang hoạt động hiện tại sẽ được giữ nguyên vẹn và chỉ được thay thế khi ứng viên hoàn tất thành công 100%."
          />
        </Space>
      </Modal>

      {/* Nested 680px GraphEvidenceDrawer */}
      {selected && (
        <GraphEvidenceDrawer
          open={evidenceDrawerOpen}
          setId={selected.id}
          setName={selected.name}
          {...(client ? { client } : {})}
          onClose={() => setEvidenceDrawerOpen(false)}
        />
      )}
    </>
  );
}
