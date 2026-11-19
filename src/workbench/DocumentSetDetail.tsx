import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  LoadingOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Modal,
  Progress,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  computeSha256,
  normalizeMarkdownForHash,
  updateDocumentSet,
} from '../db/repositories/documentSetRepo';
import { AttemptHistoryList } from '../components/knowledge/AttemptHistoryList';
import { DocumentSetDeleteDialog } from '../components/knowledge/DocumentSetDeleteDialog';
import { DocumentSetForm } from '../components/knowledge/DocumentSetForm';
import { GraphEvidenceDrawer } from '../components/knowledge/GraphEvidenceDrawer';
import { PublishPreviewModal } from '../components/knowledge/PublishPreviewModal';
import { formatOversizedAtomicBlockError } from '../components/knowledge/PublishProgressPanel';
import { useOptionalKnowledgeConfig } from '../services/knowledge/knowledgeConfig';
import {
  createKnowledgeClient,
  KnowledgeClientError,
  type ChunkStatusItem,
  type ChunksListResponse,
  type GraphBuildStage,
  type GraphState,
  type GraphStatusResponse,
  type KnowledgeClient,
} from '../services/knowledge/knowledgeClient';
import type {
  CachedActiveSnapshotManifest,
  ChangePreview,
} from '../services/knowledge/changePreview';
import { PublishSession } from '../services/knowledge/publishOrchestrator';
import type { Note, PublishPrimaryState } from '../types/models';
import { generateId } from '../utils/uuid';

const { Text, Title, Paragraph } = Typography;

/** Fixed page size for the bounded document list in a doc_set tab (D-08 / T-45-04). */
export const DOC_SET_PAGE_SIZE = 10;

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
  'Retrieval generation': 'Tạo chỉ mục truy xuất',
  Activation: 'Kích hoạt',
};

const STAGE_PROGRESS: Record<GraphBuildStage, number> = {
  Preparing: 15,
  'Structured extraction': 35,
  'Prose extraction': 55,
  Validation: 75,
  'Retrieval generation': 90,
  Activation: 100,
};

export interface DocumentSetDetailProps {
  setId: string;
  db?: TaskPlannerDatabase | undefined;
  /** Test-only injection points; production always derives these from knowledge config/DB. */
  knowledgeClient?: KnowledgeClient | undefined;
  configured?: boolean | undefined;
  graphStatusOverride?: GraphStatusResponse | undefined;
}

interface DocumentRow {
  key: string;
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * Single home for every per-set action in the `doc_set` editor tab. All reads are local
 * (IndexedDB); the optional knowledge client powers publish/graph actions and the shared
 * delete dialog, never document browsing. Replaces the retired DocumentSetDrawer.
 */
export function DocumentSetDetail({
  setId,
  db = defaultDb,
  knowledgeClient: injectedClient,
  configured: configuredOverride,
  graphStatusOverride,
}: DocumentSetDetailProps) {
  const { token } = theme.useToken();
  const knowledgeConfig = useOptionalKnowledgeConfig();
  const configured = configuredOverride ?? Boolean(knowledgeConfig.enabled && knowledgeConfig.baseUrl);
  const client = useMemo<KnowledgeClient | undefined>(() => {
    if (injectedClient) return injectedClient;
    if (!db || !knowledgeConfig.enabled || !knowledgeConfig.baseUrl) return undefined;
    return createKnowledgeClient({
      baseUrl: knowledgeConfig.baseUrl,
      token: knowledgeConfig.token,
      db,
    });
  }, [injectedClient, db, knowledgeConfig.enabled, knowledgeConfig.baseUrl, knowledgeConfig.token]);

  const [reconcilingAttemptId, setReconcilingAttemptId] = useState<string>();
  const [reconciliationError, setReconciliationError] = useState<string>();
  const [offline, setOffline] = useState(false);
  const [previewSession, setPreviewSession] = useState<PublishSession | null>(null);
  const [preview, setPreview] = useState<ChangePreview | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Graph state & inspection
  const [graphStatus, setGraphStatus] = useState<GraphStatusResponse | undefined>(graphStatusOverride);
  const [graphLoading, setGraphLoading] = useState(false);
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  const [connectivityUncertain, setConnectivityUncertain] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chunkModalOpen, setChunkModalOpen] = useState(false);
  const [chunkData, setChunkData] = useState<ChunksListResponse | null>(null);
  const [chunkLoading, setChunkLoading] = useState(false);
  const [retryingChunkId, setRetryingChunkId] = useState<string | null>(null);

  const set = useLiveQuery(async () => {
    if (!db) return null;
    return (await db.documentSets.get(setId)) ?? null;
  }, [db, setId], null);

  const documentIdsKey = set?.documentIds.join(',') ?? '';
  const documents = useLiveQuery(async () => {
    if (!db || !set) return [] as Note[];
    const found = await db.notes.bulkGet(set.documentIds);
    return found.filter((note): note is Note => Boolean(note) && note?.type !== 'folder');
  }, [db, set?.id, documentIdsKey], [] as Note[]);

  const allNotes = useLiveQuery(async () => {
    if (!db) return [] as Note[];
    return db.notes.toArray();
  }, [db], [] as Note[]);
  const allSets = useLiveQuery(async () => {
    if (!db) return [] as import('../types/models').DocumentSet[];
    return db.documentSets.toArray();
  }, [db], [] as import('../types/models').DocumentSet[]);
  const formNotes = useMemo(
    () => allNotes.filter((note) => note.type !== 'folder' && note.type !== 'diagram' && !note.deletedAt),
    [allNotes]
  );

  const publishData = useLiveQuery(async () => {
    if (!db || !set) return { publishedDocuments: [], attempts: [] } as {
      publishedDocuments: import('../types/models').PublishedDocumentMetadata[];
      attempts: import('../types/models').PublishAttemptCache[];
    };
    const [publishedDocuments, attempts] = await Promise.all([
      db.publishedDocuments.where('setId').equals(set.id).toArray(),
      db.publishAttempts.where('setId').equals(set.id).toArray(),
    ]);
    return { publishedDocuments, attempts };
  }, [db, set?.id], {
    publishedDocuments: [],
    attempts: [],
  } as {
    publishedDocuments: import('../types/models').PublishedDocumentMetadata[];
    attempts: import('../types/models').PublishAttemptCache[];
  });

  const noteHashes = useLiveQuery(async () => {
    const entries = await Promise.all(
      formNotes.map(async (note) => [note.id, await computeSha256(normalizeMarkdownForHash(note.body))] as const)
    );
    return Object.fromEntries(entries) as Record<string, string>;
  }, [formNotes], {} as Record<string, string>);

  // WR-02: publishedDocuments alone is not authoritative. An attempt can be Publishing,
  // reconcile can fail mid-terminal, or a backup may predate the metadata rows. If we
  // cannot rule out a remote snapshot, keep the gated published delete path.
  const published = publishData.publishedDocuments.length > 0 || publishData.attempts.length > 0;

  const publishView = useMemo(() => {
    const attempts = [...publishData.attempts].sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
    );
    const publishing = attempts.find((attempt) => attempt.status === 'Publishing');
    if (publishing) {
      return { state: 'Publishing' as PublishPrimaryState, activeAttemptId: publishing.id };
    }
    const newestTerminal = attempts[0];
    if (newestTerminal?.status === 'Failed' || newestTerminal?.status === 'Warning') {
      return { state: newestTerminal.status as PublishPrimaryState, activeAttemptId: undefined };
    }
    const metadata = publishData.publishedDocuments;
    if (metadata.length === 0) {
      return { state: 'Never published' as PublishPrimaryState, activeAttemptId: undefined };
    }
    const metadataById = new Map(metadata.map((item) => [item.documentId, item]));
    const membershipMatches =
      metadata.length === set?.documentIds.length &&
      (set?.documentIds ?? []).every((documentId) => metadataById.has(documentId));
    const hashesMatch =
      membershipMatches &&
      (set?.documentIds ?? []).every(
        (documentId) => noteHashes[documentId] === metadataById.get(documentId)?.publishedContentHash
      );
    return {
      state: (hashesMatch ? 'In sync' : 'Local changes') as PublishPrimaryState,
      activeAttemptId: undefined,
    };
  }, [publishData, noteHashes, set?.documentIds]);

  const state = publishView.state;
  const activeAttemptId = publishView.activeAttemptId;
  const stateUi = STATE_UI[state];
  const activeSummary = publishData.publishedDocuments.length > 0
    ? `${publishData.publishedDocuments.length} tài liệu trong ảnh chụp đang hoạt động`
    : undefined;
  const cachedAt = useMemo(() => {
    const completed = publishData.attempts.filter((attempt) => attempt.completedAt);
    if (!completed.length) return undefined;
    completed.sort(
      (a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
    );
    return completed[0]?.completedAt;
  }, [publishData.attempts]);
  const previewDisabled = !set?.documentIds.length || !configured || state === 'Publishing';

  // Fetch graph status when this tab's set or client changes (tab is always mounted when active).
  useEffect(() => {
    if (graphStatusOverride) {
      setGraphStatus(graphStatusOverride);
      return;
    }
    if (!setId || !client) {
      setGraphStatus(undefined);
      return;
    }

    let active = true;
    setGraphLoading(true);
    setConnectivityUncertain(false);

    client
      .getGraphStatus(setId)
      .then((res) => {
        if (!active) return;
        setGraphStatus(res);
        setOffline(false);
      })
      .catch((err) => {
        if (!active) return;
        if (err?.code === 'NETWORK_ERROR') {
          setConnectivityUncertain(true);
          setOffline(true);
        }
      })
      .finally(() => {
        if (active) setGraphLoading(false);
      });

    return () => {
      active = false;
    };
  }, [setId, client, graphStatusOverride]);

  const handleReconcileAttempt = async () => {
    if (!configured || !activeAttemptId || reconcilingAttemptId) return;
    setReconcilingAttemptId(activeAttemptId);
    setReconciliationError(undefined);
    try {
      const cachedAttempt = await db.publishAttempts.get(activeAttemptId);
      if (!cachedAttempt?.submittedDocuments?.length) {
        setReconciliationError('Không thể tiếp tục kiểm tra: thiếu ảnh chụp đã gửi được lưu cục bộ.');
        return;
      }
      const reconcileClient = client ?? createKnowledgeClient({
        baseUrl: knowledgeConfig.baseUrl,
        token: knowledgeConfig.token,
        db,
      });
      const result = await new PublishSession({ client: reconcileClient, db }).pollAcceptedAttempt(activeAttemptId);
      if (result.uncertain) {
        setOffline(true);
        setReconciliationError('Mất kết nối — chưa xác định kết quả.');
      }
    } catch {
      setReconciliationError('Không thể kiểm tra trạng thái. Kiểm tra kết nối rồi thử lại.');
    } finally {
      setReconcilingAttemptId(undefined);
    }
  };

  const handlePreviewDocumentSet = async () => {
    if (!set || !configured || previewLoading) {
      if (!configured) message.warning('Hãy cấu hình Knowledge Server trước khi xuất bản.');
      return;
    }
    setPreviewLoading(true);
    try {
      const previewClient = client ?? createKnowledgeClient({
        baseUrl: knowledgeConfig.baseUrl,
        token: knowledgeConfig.token,
        db,
      });
      let activeManifest: CachedActiveSnapshotManifest | null = null;
      try {
        activeManifest = await previewClient.getSnapshotManifest(set.id);
      } catch (err: unknown) {
        if (
          err instanceof KnowledgeClientError &&
          err.status === 404 &&
          err.serverCode === 'SNAPSHOT_NOT_FOUND'
        ) {
          activeManifest = null;
        } else {
          if (err instanceof KnowledgeClientError) {
            if (err.code === 'NETWORK_ERROR') {
              message.error('Không thể kết nối Knowledge Server. Kiểm tra máy chủ và mạng rồi thử lại.');
            } else if (err.status === 401) {
              message.error('Token phiên không hợp lệ hoặc đã hết hạn.');
            } else if (err.status === 403) {
              message.error('Token phiên không có quyền truy cập Knowledge Server.');
            } else if (err.code === 'INVALID_RESPONSE') {
              message.error('Knowledge Server phản hồi không hợp lệ.');
            } else {
              message.error('Máy chủ Knowledge Server gặp lỗi khi kiểm tra ảnh chụp.');
            }
          } else {
            message.error('Không thể kiểm tra ảnh chụp trên Knowledge Server.');
          }
          return;
        }
      }
      const session = new PublishSession({ client: previewClient, db });
      const setNotes = formNotes.filter((note) => set.documentIds.includes(note.id));
      const nextPreview = await session.buildPreview({ documentSet: set, notes: setNotes, activeManifest });
      setPreviewSession(session);
      setPreview(nextPreview);
      setPreviewModalOpen(true);
    } catch (error: unknown) {
      message.error(formatOversizedAtomicBlockError(error) ?? 'Không thể tạo bản xem trước xuất bản.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSaveDocumentSet = async (value: import('../components/knowledge/DocumentSetForm').DocumentSetFormValue) => {
    try {
      await updateDocumentSet(setId, value, db);
      message.success('Đã cập nhật bộ tài liệu');
    } catch (err) {
      console.error('Failed to save document set:', err);
      message.error(err instanceof Error ? err.message : 'Không thể lưu bộ tài liệu');
    }
  };

  const handleTriggerRebuild = async () => {
    if (!client) return;
    setRebuildConfirmOpen(false);
    setRebuilding(true);
    setConnectivityUncertain(false);

    const rebuildKey = generateId();

    try {
      const rebuildAccepted = await client.triggerGraphRebuild(setId, rebuildKey);
      message.info('Đã bắt đầu xây dựng lại đồ thị tri thức.');

      let finalStatus = await client.pollGraphStatus(setId, {
        initialDelayMs: 800,
        maxDelayMs: 2000,
        onProgress: (liveStatus) => setGraphStatus(liveStatus),
      });

      if (
        finalStatus.state !== 'Failed' &&
        !finalStatus.uncertain &&
        (finalStatus.candidateStatus === 'READY' ||
          (finalStatus.state === 'Never built' && rebuildAccepted.candidateSnapshotId))
      ) {
        const candidateId = finalStatus.candidateSnapshotId || rebuildAccepted.candidateSnapshotId;
        finalStatus = await client.activateGraphCandidate(setId, candidateId);
      }

      setGraphStatus(finalStatus);
      if (finalStatus.state === 'Failed') {
        message.error(finalStatus.error?.message ?? 'Xây dựng đồ thị tri thức thất bại.');
      } else if (finalStatus.uncertain) {
        setConnectivityUncertain(true);
        setOffline(true);
        message.warning('Mất kết nối — chưa xác định kết quả xây dựng đồ thị.');
      } else {
        message.success('Xây dựng đồ thị tri thức hoàn tất.');
      }
    } catch (err: any) {
      if (err?.code === 'NETWORK_ERROR') {
        setConnectivityUncertain(true);
        setOffline(true);
      } else {
        message.error(err instanceof Error ? err.message : 'Xây dựng lại đồ thị thất bại.');
      }
    } finally {
      setRebuilding(false);
    }
  };

  const handleFetchChunks = async () => {
    if (!client) return;
    setChunkLoading(true);
    try {
      setChunkData(await client.getGraphChunks(setId));
    } catch {
      message.error('Không thể lấy danh sách trạng thái từng phần.');
    } finally {
      setChunkLoading(false);
    }
  };

  const handleRetrySelectiveChunks = async (
    optionsOrChunkIds?: string[] | { chunkIds?: string[]; mode?: 'pending' | 'failed' | 'all' }
  ) => {
    if (!client) return;
    setRebuilding(true);
    setConnectivityUncertain(false);
    try {
      message.loading({ content: 'Đang bắt đầu xử lý các phần đã chọn...', key: 'retry-chunks' });
      const accepted = await client.retryGraphChunks(setId, optionsOrChunkIds);
      message.success({ content: 'Đã nhận yêu cầu xử lý trích xuất.', key: 'retry-chunks' });
      await handleFetchChunks();

      let finalStatus = await client.pollGraphStatus(setId, {
        initialDelayMs: 1500,
        maxDelayMs: 4000,
        onProgress: (status) => {
          setGraphStatus(status);
          handleFetchChunks().catch(() => {});
        },
      });

      if (
        finalStatus.state !== 'Failed' &&
        !finalStatus.uncertain &&
        (finalStatus.candidateStatus === 'READY' ||
          (finalStatus.state === 'Never built' && accepted.candidateSnapshotId))
      ) {
        const candidateId = finalStatus.candidateSnapshotId || accepted.candidateSnapshotId;
        finalStatus = await client.activateGraphCandidate(setId, candidateId);
      }

      setGraphStatus(finalStatus);
      await handleFetchChunks();

      if (finalStatus.state === 'Failed') {
        message.error(finalStatus.error?.message ?? 'Trích xuất đồ thị thất bại.');
      } else if (finalStatus.candidateStatus === 'READY') {
        message.success('Hoàn thành trích xuất và cập nhật đồ thị tri thức.');
      } else {
        message.info(
          finalStatus.progress?.stageMessage ??
            'Đã xử lý xong các phần đã chọn. Vẫn còn phần chờ xử lý.'
        );
      }
    } catch (err: any) {
      message.error(err instanceof Error ? err.message : 'Thao tác thất bại.');
    } finally {
      setRebuilding(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!client) return;
    setGraphLoading(true);
    setConnectivityUncertain(false);
    try {
      let res = await client.getGraphStatus(setId);
      if (res.state === 'Never built' && res.candidateStatus === 'READY' && res.candidateSnapshotId) {
        res = await client.activateGraphCandidate(setId, res.candidateSnapshotId);
      }
      setGraphStatus(res);
      setOffline(false);
    } catch (err: any) {
      if (err?.code === 'NETWORK_ERROR') {
        setConnectivityUncertain(true);
        setOffline(true);
      } else {
        message.error('Không thể kiểm tra trạng thái đồ thị.');
      }
    } finally {
      setGraphLoading(false);
    }
  };

  const openDeleteModal = useCallback(() => setDeleteOpen(true), []);
  const handleCloseDelete = useCallback(() => setDeleteOpen(false), []);

  if (!set) {
    return (
      <div style={{ padding: 24 }}>
        <Empty
          description="Không tìm thấy bộ tài liệu. Bộ tài liệu có thể đã bị xóa hoặc chưa được đồng bộ cục bộ."
        />
      </div>
    );
  }

  const rows: DocumentRow[] = documents.map((note) => ({
    key: note.id,
    id: note.id,
    title: note.title || 'Không tiêu đề',
    updatedAt: note.updatedAt,
  }));
  const documentTitles = Object.fromEntries(allNotes.map((note) => [note.id, note.title || 'Không tiêu đề']));

  // D-18: rebuild only when a published snapshot exists, daemon reachable, no build in progress.
  const hasPublishedSnapshot = state === 'In sync' || state === 'Local changes' || state === 'Warning';
  const isBuilding = rebuilding || graphStatus?.state === 'Building';
  const rebuildDisabled = !hasPublishedSnapshot || !configured || isBuilding || !client;
  const currentGraphState = graphStatus?.state ?? 'Never built';
  const currentGraphUi = GRAPH_STATE_UI[currentGraphState];

  return (
    <div
      data-testid="doc-set-detail"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12, overflow: 'auto' }}
    >
      <div style={{ flexShrink: 0 }}>
        <Title level={4} style={{ margin: 0, fontSize: 20 }}>
          {set.name}
        </Title>
        {set.description ? (
          <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {set.description}
          </Paragraph>
        ) : null}
        <Space wrap style={{ marginTop: 8 }}>
          <Tooltip title={stateUi.label}>
            <Tag color={stateUi.color} icon={stateUi.icon}>{stateUi.label}</Tag>
          </Tooltip>
          {activeSummary ? <Text>{activeSummary}</Text> : null}
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Xóa bộ tài liệu ${set.name}`}
            onClick={openDeleteModal}
          >
            Xóa bộ tài liệu
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        message="Dữ liệu bộ tài liệu được đọc từ máy local (IndexedDB). Việc xóa bộ tài liệu có thể yêu cầu Knowledge Server nếu set đã được xuất bản."
        style={{ flexShrink: 0 }}
      />

      {offline && cachedAt && (
        <Alert
          type="warning"
          showIcon
          message={`Dữ liệu trạng thái gần nhất: ${cachedAt}`}
          description="Không thể tải trạng thái từ Knowledge Server. Bạn vẫn có thể chỉnh sửa và tìm kiếm tài liệu cục bộ. Kiểm tra kết nối rồi thử lại."
        />
      )}
      {!configured && (
        <Alert
          type="info"
          showIcon
          message="Chưa cấu hình Knowledge Server."
          action={<Button onClick={() => { window.location.hash = '#/settings'; }}>Mở cài đặt</Button>}
        />
      )}
      {reconciliationError && <Alert type="error" showIcon message={reconciliationError} />}
      {state === 'Publishing' && activeAttemptId && (
        <Button
          loading={reconcilingAttemptId === activeAttemptId}
          disabled={!configured || reconcilingAttemptId === activeAttemptId}
          onClick={() => void handleReconcileAttempt()}
        >
          Kiểm tra trạng thái
        </Button>
      )}

      <DocumentSetForm
        notes={formNotes}
        initialSet={set}
        availableSets={allSets.filter((candidate) => candidate.id !== set.id)}
        onSave={(value) => void handleSaveDocumentSet(value)}
      />
      <Button
        aria-label="Xem trước xuất bản"
        type="primary"
        disabled={previewDisabled}
        loading={previewLoading}
        onClick={() => void handlePreviewDocumentSet()}
      >
        Xem trước xuất bản
      </Button>

      {/* Section: Đồ thị tri thức (Knowledge Graph) */}
      <section aria-labelledby="knowledge-graph-heading">
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
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
              message={graphStatus.error?.code ? `Xây dựng thất bại: ${graphStatus.error.code}` : 'Xây dựng đồ thị thất bại'}
              description={
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <Text>
                    {graphStatus.error?.message ??
                      'Đồ thị tri thức chưa thể tạo. Kiểm tra tài liệu đã xuất bản hoặc LLM server rồi bấm Thử lại.'}
                  </Text>
                  {graphStatus.error?.details && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', wordBreak: 'break-all' }}>
                      Chi tiết: {graphStatus.error.details}
                    </Text>
                  )}
                  <Space size="small" style={{ marginTop: 4 }}>
                    <Button
                      type="primary"
                      danger
                      size="small"
                      icon={<ReloadOutlined />}
                      onClick={() => setRebuildConfirmOpen(true)}
                    >
                      Xây dựng lại toàn bộ
                    </Button>
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => {
                        void handleFetchChunks();
                        setChunkModalOpen(true);
                      }}
                    >
                      Chi tiết từng phần & Thử lại lỗi
                    </Button>
                  </Space>
                </Space>
              }
            />
          )}

          <Card size="small" bordered style={{ background: token.colorBgContainer }}>
            {graphLoading ? (
              <Skeleton active paragraph={{ rows: 3 }} />
            ) : (
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                {isBuilding && (
                  <div style={{ marginBottom: token.marginXS }}>
                    <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
                      <Text strong>Giai đoạn: {STAGE_LABELS[graphStatus?.currentStage ?? 'Preparing']}</Text>
                      {graphStatus?.progress?.totalChunks ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Phần: {graphStatus.progress.processedChunks}/{graphStatus.progress.totalChunks}
                        </Text>
                      ) : (
                        <Text type="secondary">Đang khởi tạo...</Text>
                      )}
                    </Space>
                    <Progress
                      percent={graphStatus?.progress?.percent ?? STAGE_PROGRESS[graphStatus?.currentStage ?? 'Preparing']}
                      status="active"
                      size="small"
                    />
                    {graphStatus?.progress?.stageMessage && (
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                        {graphStatus.progress.stageMessage}
                      </Text>
                    )}
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4, color: token.colorTextTertiary }}>
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
            <Button icon={<ReloadOutlined />} disabled={!configured} onClick={() => void handleRefreshStatus()}>
              Kiểm tra trạng thái
            </Button>
            <Button
              icon={<DatabaseOutlined />}
              disabled={!configured}
              onClick={() => {
                void handleFetchChunks();
                setChunkModalOpen(true);
              }}
            >
              Tiến trình từng phần
            </Button>
          </Space>
        </Space>
      </section>

      <section aria-labelledby="attempt-history-heading">
        <Title level={3} id="attempt-history-heading">Lịch sử xuất bản</Title>
        <AttemptHistoryList attempts={publishData.attempts} />
      </section>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }} data-testid="doc-set-documents">
        <Table<DocumentRow>
          rowKey="key"
          size="small"
          dataSource={rows}
          pagination={{ pageSize: DOC_SET_PAGE_SIZE, showSizeChanger: false }}
          locale={{ emptyText: 'Bộ tài liệu này chưa có tài liệu nào.' }}
          columns={[
            { title: 'Tài liệu', dataIndex: 'title', key: 'title', ellipsis: true },
            {
              title: 'Cập nhật',
              dataIndex: 'updatedAt',
              key: 'updatedAt',
              width: 180,
              ellipsis: true,
              render: (value: string) => <Text style={{ fontSize: 12 }}>{value}</Text>,
            },
          ]}
        />
      </div>

      {/* Confirmation modal before rebuild per D-21 */}
      <Modal
        open={rebuildConfirmOpen}
        title="Xác nhận xây dựng lại đồ thị tri thức"
        onCancel={() => setRebuildConfirmOpen(false)}
        onOk={() => void handleTriggerRebuild()}
        okText="Bắt đầu xây dựng"
        cancelText="Hủy"
      >
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
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

      <GraphEvidenceDrawer
        open={evidenceDrawerOpen}
        setId={set.id}
        setName={set.name}
        {...(client ? { client } : {})}
        onClose={() => setEvidenceDrawerOpen(false)}
      />

      <DocumentSetDeleteDialog
        open={deleteOpen}
        set={set}
        database={db}
        {...(client ? { client } : {})}
        published={published}
        onClose={handleCloseDelete}
      />

      {/* Granular Chunk Progress & Selective Retry Modal */}
      <Modal
        open={chunkModalOpen}
        title="Tiến trình trích xuất từng phần (Chunks)"
        width={850}
        onCancel={() => setChunkModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setChunkModalOpen(false)}>Đóng</Button>,
          <Button key="refresh" icon={<ReloadOutlined />} loading={chunkLoading} onClick={() => void handleFetchChunks()}>
            Làm mới
          </Button>,
          <Button
            key="runPending"
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={rebuilding}
            disabled={!chunkData || chunkData.pending === 0}
            onClick={() => void handleRetrySelectiveChunks({ mode: 'pending' })}
          >
            Chạy các phần chờ xử lý ({chunkData?.pending ?? 0})
          </Button>,
          <Button
            key="retryFailed"
            type="primary"
            danger
            icon={<ReloadOutlined />}
            loading={rebuilding}
            disabled={!chunkData || chunkData.failed === 0}
            onClick={() => void handleRetrySelectiveChunks({ mode: 'failed' })}
          >
            Thử lại tất cả phần lỗi ({chunkData?.failed ?? 0})
          </Button>,
        ]}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {chunkData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              <Statistic title="Tổng số phần" value={chunkData.total} />
              <Statistic title="Thành công" value={chunkData.success} valueStyle={{ color: token.colorSuccess }} />
              <Statistic
                title="Thất bại"
                value={chunkData.failed}
                valueStyle={{ color: chunkData.failed > 0 ? token.colorError : undefined }}
              />
              <Statistic title="Đang xử lý" value={chunkData.extracting} valueStyle={{ color: token.colorPrimary }} />
              <Statistic title="Chờ xử lý" value={chunkData.pending} />
            </div>
          )}

          <Table<ChunkStatusItem>
            size="small"
            rowKey="chunkId"
            loading={chunkLoading}
            dataSource={chunkData?.chunks ?? []}
            pagination={{ pageSize: 8 }}
            columns={[
              { title: 'Tài liệu', dataIndex: 'documentTitle', key: 'documentTitle', ellipsis: true },
              {
                title: 'Phần',
                key: 'chunkIndex',
                width: 90,
                render: (_, r) => `${r.chunkIndex + 1}/${r.totalChunksInDoc}`,
              },
              {
                title: 'Trạng thái',
                key: 'status',
                width: 140,
                render: (_, r) => {
                  if (r.status === 'SUCCESS') {
                    return <Tag color="success">Thành công ({r.nodesCount}E / {r.factsCount}R)</Tag>;
                  }
                  if (r.status === 'FAILED') {
                    return (
                      <Tooltip title={r.error ?? 'Lỗi không xác định'}>
                        <Tag color="error">Thất bại</Tag>
                      </Tooltip>
                    );
                  }
                  if (r.status === 'EXTRACTING') {
                    return <Tag color="processing" icon={<LoadingOutlined spin />}>Đang gọi LLM</Tag>;
                  }
                  return <Tag color="default">Chờ xử lý</Tag>;
                },
              },
              {
                title: 'Chi tiết / Lỗi',
                dataIndex: 'error',
                key: 'error',
                ellipsis: true,
                render: (text) =>
                  text ? (
                    <Text type="danger" style={{ fontSize: 12 }}>{text}</Text>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>-</Text>
                  ),
              },
              {
                title: 'Thao tác',
                key: 'action',
                width: 120,
                render: (_, r) => {
                  if (r.status === 'FAILED' || r.status === 'PENDING') {
                    return (
                      <Button
                        size="small"
                        type="link"
                        danger={r.status === 'FAILED'}
                        loading={rebuilding && retryingChunkId === r.chunkId}
                        onClick={() => {
                          setRetryingChunkId(r.chunkId);
                          void handleRetrySelectiveChunks([r.chunkId]).finally(() => setRetryingChunkId(null));
                        }}
                      >
                        {r.status === 'FAILED' ? 'Thử lại' : 'Chạy ngay'}
                      </Button>
                    );
                  }
                  return null;
                },
              },
            ]}
          />
        </Space>
      </Modal>

      {previewSession && preview && (
        <PublishPreviewModal
          open={previewModalOpen}
          preview={preview}
          session={previewSession}
          documentTitles={documentTitles}
          onClose={() => {
            setPreviewModalOpen(false);
            setPreviewSession(null);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}

export default DocumentSetDetail;
