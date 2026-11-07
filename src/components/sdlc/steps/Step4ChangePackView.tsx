import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Typography,
  Alert,
  Button,
  message,
  Spin,
  theme,
  Card,
  Space,
  Tag,
  Collapse,
  Progress,
} from 'antd';
import {
  ArrowRightOutlined,
  UploadOutlined,
  SyncOutlined,
  BranchesOutlined,
  CloudUploadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { ChangePackDropzone } from '../../ai/wizard/ChangePackDropzone';
import { ConventionsSummaryCard, type ConventionsSummaryProps } from '../common/ConventionsSummaryCard';
import { DriftMatrixView } from '../../ai/wizard/DriftMatrixView';
import { MultiPackTable } from '../pack/MultiPackTable';
import { buildHubReconciliation, validateHubChangePack } from '../../../services/wizard/hubChangePack';
import type { ReconciliationResult } from '../../../services/wizard/reconciliation';
import type { ChangePackManifest } from '../../../services/wizard/changePack';
import { formatGuardMessage } from '../../../services/wizard/workflowGuards';
import {
  LEGACY_SYSTEM_ID,
  getMultiPackState,
  saveMultiPackState,
  type ChangePackHistoryItem,
  type MultiPackState,
} from '../../../services/wizard/sdlcCrManager';
import type { SdlcArtifactRef, SdlcStepId } from '../../../services/wizard/workflowSchemas';
import type { BranchSnapshot } from '../../../types/gitRemote';
import type { System } from '../../../types/models';
import { checkHeadDrift } from '../../../services/gitRemoteService';
import { getSshConfigs } from '../../../services/sshService';
import {
  createChangePackFromSnapshot,
} from '../../../services/changePackPackager';

export interface Step4ChangePackViewProps {
  changeRequestId: string;
  crId: string;
  crCode: string;
  solutionArtifact?: SdlcArtifactRef | undefined;
  /** D-40: one approved snapshot per target subsystem, keyed by `System.id`. */
  branchSnapshots?: Record<string, BranchSnapshot> | undefined;
  /** @deprecated legacy single-subsystem slot, read as a fallback only. */
  branchSnapshot?: BranchSnapshot | undefined;
  /** D-36: SSH/repo come from the CR's target subsystems, not a settings binding. */
  targetSystems?: System[] | undefined;
  initialDriftResult?: ReconciliationResult | undefined;
  onCommitChangePackAndDrift: (
    packHash: string,
    packTitle: string,
    driftResult: ReconciliationResult
  ) => Promise<void>;
  /** Navigates to the step that supplies the missing prerequisite (D-20). */
  onNavigateToStep?: ((step: SdlcStepId) => void) | undefined;
  onProceedToStep5?: (() => void) | undefined;
  conventionsSummary?: ConventionsSummaryProps | undefined;
  db?: TaskPlannerDatabase | undefined;
}

type PackStatus = 'idle' | 'packing' | 'success' | 'error' | 'skipped';

interface PackCardState {
  status: PackStatus;
  error?: string;
  packHash?: string;
  filename?: string;
  fileSize?: number;
  driftCount?: number;
}

interface PackCard {
  systemId: string;
  system?: System | undefined;
}

/** The SOLUTION Note pins against the SOLUTION thread, not the CHANGE_PACK thread. */
function solutionThreadId(changeRequestId: string, crId: string): string {
  return `sdlc:${changeRequestId}:${crId}:SOLUTION`;
}

/** Manifest minus raw entry bytes: only identity + path/status/coverage are needed to reconcile. */
function persistableManifest(manifest: Readonly<ChangePackManifest>): ChangePackManifest {
  return {
    ...manifest,
    entries: manifest.entries.map((entry) => ({ ...entry, content: '' })),
  };
}

const SSH_PACKAGING_ERROR =
  'Không thể kết nối SSH hoặc đóng gói thất bại. Vui lòng kiểm tra cấu hình kết nối hoặc nạp tệp zip thủ công.';

/** The packager emits its dirty-tree notice as a warning; D-09 wants it as an info banner. */
const DIRTY_WARNING_PATTERN = /tệp chưa commit/i;

const STATUS_TAG: Record<PackStatus, { color: string; label: string }> = {
  idle: { color: 'default', label: 'Chưa đóng gói' },
  packing: { color: 'processing', label: 'Đang đóng gói' },
  success: { color: 'success', label: 'Thành công' },
  error: { color: 'error', label: 'Thất bại' },
  skipped: { color: 'default', label: 'Bỏ qua' },
};

export const Step4ChangePackView: React.FC<Step4ChangePackViewProps> = ({
  changeRequestId,
  crId,
  crCode,
  solutionArtifact,
  branchSnapshots,
  branchSnapshot,
  targetSystems = [],
  initialDriftResult,
  onCommitChangePackAndDrift,
  onNavigateToStep,
  onProceedToStep5,
  conventionsSummary,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  /** Manual-upload failures only; pack failures live on their own card (D-40). */
  const [manualError, setManualError] = useState<string | null>(null);
  const [needsReupload, setNeedsReupload] = useState(false);
  const [multiPackState, setMultiPackState] = useState<MultiPackState>({ packs: [] });
  const [driftResult, setDriftResult] = useState<ReconciliationResult | undefined>(initialDriftResult);

  // D-40: one status slot per subsystem. No global error state can blank the step.
  const [packState, setPackState] = useState<Record<string, PackCardState>>({});
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [settled, setSettled] = useState(0);
  const [summary, setSummary] = useState<
    { type: 'success' | 'warning' | 'info'; text: string; detail?: string } | undefined
  >(undefined);
  const stopRequestedRef = useRef(false);

  const [packagingWarnings, setPackagingWarnings] = useState<string[]>([]);
  // D-08: drift is surfaced once per subsystem and re-checked on retry until confirmed.
  const [driftPrompt, setDriftPrompt] = useState<{ systemId: string; currentHeadSha: string } | null>(null);
  const [driftConfirmed, setDriftConfirmed] = useState<Record<string, boolean>>({});
  // D-09: separate info banner for the dirty working tree.
  const [dirtyNotice, setDirtyNotice] = useState(false);
  // D-03: without an approved snapshot the manual fallback opens straight away.
  const hasAnySnapshot = Boolean(branchSnapshot) || Object.keys(branchSnapshots ?? {}).length > 0;
  const [manualAccordionOpen, setManualAccordionOpen] = useState(!hasAnySnapshot);

  const cards = useMemo<PackCard[]>(() => {
    if (targetSystems.length > 0) {
      return targetSystems.map((system) => ({ systemId: system.id, system }));
    }
    // Legacy in-flight workflow: one approved snapshot and no target list yet.
    return branchSnapshot ? [{ systemId: LEGACY_SYSTEM_ID, system: undefined }] : [];
  }, [targetSystems, branchSnapshot]);

  const total = cards.length;

  useEffect(() => {
    if (!hasAnySnapshot) setManualAccordionOpen(true);
  }, [hasAnySnapshot]);

  // Load multipack state from DB
  useEffect(() => {
    let cancelled = false;
    async function loadPacks() {
      const state = await getMultiPackState(changeRequestId, crId, db);
      if (!cancelled) {
        setMultiPackState(state);
      }
    }
    loadPacks();
    return () => {
      cancelled = true;
    };
  }, [changeRequestId, crId, db]);

  /** Per-subsystem snapshot, with the legacy single slot used only when it is unambiguous. */
  const snapshotFor = (systemId: string): BranchSnapshot | undefined => {
    const direct = branchSnapshots?.[systemId];
    if (direct) return direct;
    if (!branchSnapshot) return undefined;
    if (cards.length === 1) return branchSnapshot;
    const system = targetSystems.find((s) => s.id === systemId);
    return system?.sshConfigId && system.sshConfigId === branchSnapshot.sshConfigId
      ? branchSnapshot
      : undefined;
  };

  const reconcile = (manifest: ChangePackManifest): Promise<ReconciliationResult> => {
    if (!solutionArtifact?.noteId) {
      return Promise.reject(new Error('SOLUTION_REQUIRED_FOR_CHANGE_PACK'));
    }
    return buildHubReconciliation({
      db,
      changeRequestId,
      threadId: solutionThreadId(changeRequestId, crId),
      manifest,
      solutionNoteId: solutionArtifact.noteId,
      solutionVersion: solutionArtifact.version,
      solutionHash: solutionArtifact.hash,
    });
  };

  /** Persists a freshly produced manifest as the active pack and pushes drift to the coordinator. */
  const commitPack = async (
    systemId: string,
    manifest: ChangePackManifest,
    filename: string,
    fileSize: number,
    reconciliation: ReconciliationResult
  ): Promise<void> => {
    const outsideSolution = reconciliation.drift.filter((d) => d.category === 'outside_solution').length;
    const missingImplementation = reconciliation.drift.filter((d) => d.category === 'missing').length;
    const divergent = reconciliation.drift.filter((d) => d.category === 'different').length;

    const newHistoryItem: ChangePackHistoryItem = {
      hash: manifest.packHash,
      filename,
      uploadedAt: new Date().toISOString(),
      fileSize,
      systemId,
      manifest: persistableManifest(manifest),
      driftSummary: {
        outsideSolution,
        missingImplementation,
        divergent,
      },
    };

    const existingWithoutCurrent = multiPackState.packs.filter((p) => p.hash !== manifest.packHash);
    const nextState: MultiPackState = {
      activePackHash: manifest.packHash,
      packs: [newHistoryItem, ...existingWithoutCurrent],
    };

    await saveMultiPackState(changeRequestId, crId, nextState, db);
    setMultiPackState(nextState);
    setDriftResult(reconciliation);
    setPackState((current) => ({
      ...current,
      [systemId]: {
        status: 'success',
        packHash: manifest.packHash,
        filename,
        fileSize,
        driftCount: reconciliation.drift.length,
      },
    }));
    await onCommitChangePackAndDrift(manifest.packHash, filename, reconciliation);
  };

  const handleSelectFile = async (file: File) => {
    if (!solutionArtifact) {
      setManualError(formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK'));
      return;
    }

    try {
      setLoading(true);
      setManualError(null);
      setNeedsReupload(false);

      // 1. Validate change-pack identity & size against expected CR
      const manifest = await validateHubChangePack(file, crCode);

      // 2. Reconcile against the real pinned SOLUTION Note
      const reconciliation = await reconcile(persistableManifest(manifest));

      // 3. Mark as active pack & commit to workflow coordinator
      await commitPack(LEGACY_SYSTEM_ID, manifest, file.name, file.size, reconciliation);
      message.success(`Đã nạp và đối chiếu thành công pack: ${file.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nạp file thất bại';
      setManualError(`Lỗi xác thực change pack: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  type PackOutcome = 'success' | 'error' | 'drift';

  /**
   * D-01/D-02 + D-40: builds one pack over SSH for one subsystem and reconciles it immediately.
   * Every failure is recorded on that subsystem's own slot, never on the step.
   */
  const packOne = async (
    card: PackCard,
    options?: { skipDriftCheck?: boolean }
  ): Promise<PackOutcome> => {
    const { systemId, system } = card;
    const snapshot = snapshotFor(systemId);
    const fail = (error: string): PackOutcome => {
      setPackState((current) => ({ ...current, [systemId]: { status: 'error', error } }));
      return 'error';
    };

    if (!snapshot) return fail('Chưa có Branch Snapshot được duyệt cho subsystem này.');
    if (!solutionArtifact?.noteId) {
      return fail(formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK'));
    }

    setPackState((current) => ({ ...current, [systemId]: { status: 'packing' } }));

    try {
      const sshConfigId = system?.sshConfigId ?? snapshot.sshConfigId;
      const repoPath = system?.remoteRepoPath ?? snapshot.remoteRepoPath;
      const configs = await getSshConfigs(db);
      const config = sshConfigId ? configs.find((c) => c.id === sshConfigId) : undefined;
      if (!config || !repoPath) return fail(SSH_PACKAGING_ERROR);

      // D-08: the approved SHA stays authoritative, but the user must confirm the drift first.
      const approvedHead = snapshot.headSha ?? snapshot.headCommit;
      const targetBranch = snapshot.targetBranch ?? snapshot.branch;
      if (!options?.skipDriftCheck && targetBranch && approvedHead && !driftConfirmed[systemId]) {
        const drift = await checkHeadDrift(config, repoPath, targetBranch, approvedHead);
        if (drift.drifted) {
          setPackState((current) => ({ ...current, [systemId]: { status: 'idle' } }));
          setDriftPrompt({ systemId, currentHeadSha: drift.currentHeadSha });
          return 'drift';
        }
      }

      const packaged = await createChangePackFromSnapshot(config, repoPath, snapshot, crCode);
      // D-09: the dirty notice gets its own info banner; keep the remaining warnings.
      const dirtyWarnings = packaged.warnings.filter((warning) => DIRTY_WARNING_PATTERN.test(warning));
      if (dirtyWarnings.length > 0) setDirtyNotice(true);
      const otherWarnings = packaged.warnings.filter((warning) => !DIRTY_WARNING_PATTERN.test(warning));
      if (otherWarnings.length > 0) {
        setPackagingWarnings((current) => Array.from(new Set([...current, ...otherWarnings])));
      }

      const manifest = await validateHubChangePack(packaged.blob, crCode);
      const reconciliation = await reconcile(persistableManifest(manifest));

      const filename = `${crCode}-${manifest.identity.head.slice(0, 8)}.zip`;
      await commitPack(systemId, manifest, filename, packaged.blob.size, reconciliation);
      return 'success';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return fail(`Lỗi kết nối SSH hoặc đóng gói: ${msg}`);
    }
  };

  const handlePackOne = async (systemId: string) => {
    if (running) return;
    setSummary(undefined);
    setPackagingWarnings([]);
    setDirtyNotice(false);
    const card = cards.find((c) => c.systemId === systemId);
    if (!card) return;
    const outcome = await packOne(card, driftConfirmed[systemId] ? { skipDriftCheck: true } : undefined);
    if (outcome === 'success') {
      message.success('Đã đóng gói và đối chiếu thành công từ Snapshot.');
    }
  };

  const handlePackAll = async () => {
    if (running || total === 0) return;
    setRunning(true);
    setStopping(false);
    stopRequestedRef.current = false;
    setSummary(undefined);
    setPackagingWarnings([]);
    setDirtyNotice(false);
    setSettled(0);
    setPackState({});

    const failed: string[] = [];
    let done = 0;
    let stopped = false;

    for (const card of cards) {
      if (stopRequestedRef.current) {
        stopped = true;
        break;
      }
      // Bulk packs the approved commit for every subsystem; the packager itself warns on drift.
      const outcome = await packOne(card, { skipDriftCheck: true });
      if (outcome !== 'success') failed.push(card.system?.code ?? card.systemId);
      done += 1;
      setSettled(done);
    }

    if (stopRequestedRef.current) stopped = true;

    if (stopped) {
      setPackState((current) => {
        const next = { ...current };
        for (const card of cards) {
          if (!next[card.systemId]) next[card.systemId] = { status: 'skipped' };
        }
        return next;
      });
      setSummary({
        type: 'info',
        text: `Đã dừng đóng gói: ${done - failed.length}/${total} subsystem thành công.`,
      });
    } else if (failed.length > 0) {
      setSummary({
        type: 'warning',
        text: `Đóng gói hoàn tất một phần: ${total - failed.length}/${total} subsystem thành công. Lỗi: ${failed.join(', ')}.`,
      });
    } else {
      setSummary({ type: 'success', text: `Đóng gói hoàn tất: ${total}/${total} subsystem thành công.` });
    }

    setRunning(false);
    setStopping(false);
  };

  const handleStop = () => {
    stopRequestedRef.current = true;
    setStopping(true);
  };

  const handleConfirmDrift = () => {
    if (!driftPrompt) return;
    const { systemId } = driftPrompt;
    setDriftConfirmed((current) => ({ ...current, [systemId]: true }));
    setDriftPrompt(null);
    const card = cards.find((c) => c.systemId === systemId);
    if (card) void packOne(card, { skipDriftCheck: true });
  };

  const handleReturnToStep3 = () => {
    setDriftPrompt(null);
    onNavigateToStep?.('CODE_GUIDE');
  };

  const handleSelectActive = async (packHash: string) => {
    const pack = multiPackState.packs.find((p) => p.hash === packHash);
    if (!pack || !solutionArtifact) return;

    const nextState: MultiPackState = {
      ...multiPackState,
      activePackHash: packHash,
    };

    await saveMultiPackState(changeRequestId, crId, nextState, db);
    setMultiPackState(nextState);

    // Rows written before manifests were persisted carry no identity to reconcile from.
    // Fabricating base/head to fill the gap would fake evidence pins, so ask for re-upload.
    if (!pack.manifest) {
      setNeedsReupload(true);
      return;
    }

    try {
      setLoading(true);
      setManualError(null);
      setNeedsReupload(false);
      const reconciliation = await reconcile(pack.manifest);
      setDriftResult(reconciliation);
      await onCommitChangePackAndDrift(packHash, pack.filename, reconciliation);
      message.info(`Đã chuyển active pack sang: ${pack.filename}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đối soát thất bại';
      setManualError(`Lỗi xác thực change pack: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePack = async (packHash: string) => {
    const nextPacks = multiPackState.packs.filter((p) => p.hash !== packHash);
    const nextState: MultiPackState = {
      ...multiPackState,
      packs: nextPacks,
    };
    await saveMultiPackState(changeRequestId, crId, nextState, db);
    setMultiPackState(nextState);
    message.success('Đã xóa pack khỏi lịch sử');
  };

  const shortSha = (sha: string | undefined): string => (sha ? sha.slice(0, 8) : '—');
  const driftPromptCard = driftPrompt ? cards.find((c) => c.systemId === driftPrompt.systemId) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      {conventionsSummary && (
        <ConventionsSummaryCard {...conventionsSummary} />
      )}
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bước 4: Nạp Change Pack & Đối chiếu Drift (Multi-Pack)
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
          Mỗi subsystem trong CR có một thẻ đóng gói riêng từ Branch Snapshot đã duyệt. Đóng gói tất cả chạy tuần tự và dừng được; một subsystem lỗi không chặn các subsystem còn lại. Bản đóng gói zip thủ công vẫn nằm ở khu vực dự phòng bên dưới.
        </Typography.Paragraph>
      </div>

      {!solutionArtifact && (
        <Alert
          type="error"
          showIcon
          message={formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK')}
          description="Tài liệu bắt buộc: SOLUTION.md đã được phê duyệt ở Bước 2. Chưa có tài liệu này thì change pack không thể đối chiếu."
          action={
            <Button
              type="primary"
              disabled={!onNavigateToStep}
              onClick={() => onNavigateToStep?.('SOLUTION')}
            >
              Chuyển đến Bước 2: Thiết kế giải pháp
            </Button>
          }
        />
      )}

      {total === 0 && (
        <Alert
          type="warning"
          showIcon
          message="Chưa có Branch Snapshot được duyệt"
          description="Vui lòng hoàn thành việc xem và duyệt nhánh tại Bước 3 trước khi đóng gói, hoặc nạp Change Pack thủ công bên dưới."
          action={
            <Button type="primary" disabled={!onNavigateToStep} onClick={() => onNavigateToStep?.('CODE_GUIDE')}>
              Quay lại Bước 3: Duyệt nhánh
            </Button>
          }
        />
      )}

      {total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Space size={12} wrap>
            {running ? (
              <Button danger icon={<StopOutlined />} loading={stopping} onClick={handleStop}>
                {stopping ? 'Đang dừng...' : 'Dừng đóng gói'}
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                disabled={!solutionArtifact}
                onClick={() => void handlePackAll()}
              >
                Đóng gói tất cả ({total})
              </Button>
            )}
            {running && (
              <div style={{ flex: 1, minWidth: 200 }} data-testid="pack-all-progress">
                <Progress
                  percent={total === 0 ? 0 : Math.round((settled / total) * 100)}
                  format={() => `${settled}/${total}`}
                  size="small"
                />
              </div>
            )}
          </Space>

          {summary && (
            <Alert
              data-testid="pack-all-summary"
              type={summary.type}
              showIcon
              message={summary.text}
            />
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: 12,
            }}
          >
            {cards.map((card) => {
              const snapshot = snapshotFor(card.systemId);
              const state = packState[card.systemId] ?? { status: 'idle' as PackStatus };
              const tag = STATUS_TAG[state.status];
              const fileCount = snapshot?.filesChangedCount ?? snapshot?.fileStats?.length ?? 0;
              return (
                <Card
                  key={card.systemId}
                  size="small"
                  data-testid={`pack-card-${card.systemId}`}
                  title={
                    <Space size={8} wrap>
                      {card.system && (
                        <Tag color="cyan" style={{ fontFamily: 'monospace', margin: 0 }}>
                          {card.system.code}
                        </Tag>
                      )}
                      <span style={{ fontSize: 16, fontWeight: 600 }}>
                        {card.system?.name ?? 'Snapshot đã duyệt'}
                      </span>
                      <Tag
                        color={tag.color}
                        icon={state.status === 'packing' ? <SyncOutlined spin /> : undefined}
                      >
                        {tag.label}
                      </Tag>
                    </Space>
                  }
                  style={{ borderColor: token.colorBorderSecondary }}
                >
                  <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    {snapshot ? (
                      <Space size={12} wrap>
                        <span>
                          <Typography.Text type="secondary">Nhánh: </Typography.Text>
                          <Tag color="blue">{snapshot.targetBranch ?? snapshot.branch ?? '—'}</Tag>
                        </span>
                        <span>
                          <Typography.Text type="secondary">Base: </Typography.Text>
                          <Typography.Text code>
                            {shortSha(snapshot.baseCommit ?? snapshot.baseBranch)}
                          </Typography.Text>
                        </span>
                        <span>
                          <Typography.Text type="secondary">Head: </Typography.Text>
                          <Typography.Text code>{shortSha(snapshot.headSha ?? snapshot.headCommit)}</Typography.Text>
                        </span>
                        <span>
                          <Typography.Text type="secondary">Tệp thay đổi: </Typography.Text>
                          <Typography.Text strong>{fileCount}</Typography.Text>
                        </span>
                      </Space>
                    ) : (
                      <Typography.Text type="secondary">
                        Chưa có Branch Snapshot được duyệt cho subsystem này.
                      </Typography.Text>
                    )}

                    <Button
                      type="primary"
                      icon={<BranchesOutlined />}
                      loading={state.status === 'packing'}
                      disabled={running || !solutionArtifact || !snapshot}
                      onClick={() => void handlePackOne(card.systemId)}
                      data-testid={`btn-pack-${card.systemId}`}
                    >
                      Đóng gói
                    </Button>

                    {state.status === 'success' && (
                      <Alert
                        type="success"
                        showIcon
                        message={state.filename ?? 'Đã đóng gói'}
                        description={`${((state.fileSize ?? 0) / 1024).toFixed(1)} KB · ${state.driftCount ?? 0} mục drift`}
                      />
                    )}
                    {state.status === 'error' && (
                      <Alert type="error" showIcon message={state.error ?? 'Đóng gói thất bại'} />
                    )}
                  </Space>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {driftPrompt && (
        <Alert
          data-testid="drift-warning"
          type="warning"
          showIcon
          message="Cảnh báo: Remote HEAD đã thay đổi"
          description={`Remote HEAD hiện tại (${shortSha(driftPrompt.currentHeadSha)}) khác với commit đã duyệt trong Snapshot của ${
            driftPromptCard?.system?.code ?? 'subsystem này'
          } (${shortSha(snapshotFor(driftPrompt.systemId)?.headSha ?? snapshotFor(driftPrompt.systemId)?.headCommit)}). Bạn muốn làm gì?`}
          action={
            <Space orientation="vertical" size={8}>
              <Button type="primary" onClick={handleConfirmDrift}>
                Tiếp tục với commit đã duyệt
              </Button>
              <Button onClick={handleReturnToStep3}>Quay lại Bước 3 duyệt lại</Button>
            </Space>
          }
        />
      )}

      {dirtyNotice && (
        <Alert
          data-testid="dirty-warning"
          type="info"
          showIcon
          message="Repository remote đang có tệp chưa commit"
          description="Change Pack được tạo dựa trên lịch sử commit đã duyệt giữa Base và Head nên không bị ảnh hưởng bởi working tree."
        />
      )}

      {packagingWarnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="Cảnh báo khi đóng gói từ Snapshot"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {packagingWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          }
        />
      )}

      {manualError && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setManualError(null)}
          message={manualError}
        />
      )}

      {needsReupload && (
        <Alert
          type="warning"
          showIcon
          message="Tải lại tệp pack để đối soát"
          description={`Pack đang chọn được nạp trước khi lưu manifest nên không còn dữ liệu đối chiếu. Kết quả drift cũ được giữ nguyên cho tới khi bạn nạp lại tệp .zip của ${crCode}.`}
        />
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin indicator={<SyncOutlined spin style={{ fontSize: 24 }} />} tip="Đang kiểm tra và đối chiếu change pack..." />
        </div>
      )}

      {/* MultiPack History Table */}
      {multiPackState.packs.length > 0 && (
        <div>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            Lịch sử Change Packs đã nạp ({multiPackState.packs.length})
          </Typography.Title>
          <MultiPackTable
            packs={multiPackState.packs}
            activePackHash={multiPackState.activePackHash}
            systems={targetSystems}
            onSelectActive={handleSelectActive}
            onDeletePack={handleDeletePack}
          />
        </div>
      )}

      {/* Drift Matrix Breakdown — one shared table for every subsystem (D-40). */}
      {driftResult && (
        <div
          style={{
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusSM,
            padding: 20,
          }}
        >
          <DriftMatrixView result={driftResult} layout="table" />
        </div>
      )}

      {/* Action Footer */}
      {driftResult && onProceedToStep5 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            background: token.colorSuccessBg,
            borderRadius: token.borderRadiusSM,
            border: `1px solid ${token.colorSuccessBorder}`,
          }}
        >
          <Typography.Text style={{ color: token.colorSuccessText, fontSize: 13 }}>
            Đã hoàn thành đối chiếu pack đang kích hoạt. Sẵn sàng tạo tài liệu kỹ thuật PL03B & PL07.
          </Typography.Text>
          <Button
            type="primary"
            size="large"
            icon={<ArrowRightOutlined />}
            onClick={onProceedToStep5}
          >
            Sang Bước 5: Sinh tài liệu kỹ thuật
          </Button>
        </div>
      )}

      {/* D-10: manual zip fallback sits below the automatic panel. */}
      <Collapse
        ghost
        activeKey={manualAccordionOpen ? ['manual_pack'] : []}
        onChange={(keys) => setManualAccordionOpen(keys.includes('manual_pack'))}
        items={[
          {
            key: 'manual_pack',
            label: (
              <Space size={8}>
                <UploadOutlined />
                <Typography.Text strong>
                  Nạp Change Pack thủ công (.zip) — Dự phòng khi không có SSH
                </Typography.Text>
              </Space>
            ),
            children: (
              <div
                style={{
                  background: token.colorBgContainer,
                  padding: 16,
                  borderRadius: token.borderRadiusSM,
                  border: `1px dashed ${token.colorBorder}`,
                }}
              >
                <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
                  Tải lên bản đóng gói mới (.zip) cho CR {crCode}:
                </Typography.Text>
                <ChangePackDropzone onSelect={handleSelectFile} disabled={!solutionArtifact} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};
