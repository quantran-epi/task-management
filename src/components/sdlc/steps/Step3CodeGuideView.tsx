import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Typography,
  Button,
  Space,
  Card,
  Alert,
  Select,
  Input,
  Tag,
  Spin,
  Empty,
  theme,
  message,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  BranchesOutlined,
  FolderOpenOutlined,
  WarningOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { getSshConfigs, getSshSecret } from '../../../services/sshService';
import {
  getRemoteBranches,
  checkDirtyStatus,
  getDiffSummary,
  getFileDiff,
  checkHeadDrift,
} from '../../../services/gitRemoteService';
import type { SshConfig } from '../../../types/ssh';
import type {
  RemoteGitBranch,
  RemoteDiffSummary,
  RemoteFileStat,
  RemoteGitStatus,
  BranchSnapshot,
} from '../../../types/gitRemote';
import type { DiffViewMode } from '../../../types/agent';
import { ResizeSplitter } from '../../common/ResizeSplitter';
import { RemoteDiffViewer } from '../diff/RemoteDiffViewer';
import { RemoteDirectoryBrowserModal } from '../../common/RemoteDirectoryBrowserModal';
import { ConventionsSummaryCard, type ConventionsSummaryProps } from '../common/ConventionsSummaryCard';
import type { SdlcStepId } from '../../../services/wizard/workflowSchemas';
import { formatGuardMessage } from '../../../services/wizard/workflowGuards';
import type { System, CrTarget } from '../../../types/models';

export interface Step3CodeGuideViewProps {
  crCode?: string;
  targetSystems?: System[] | undefined;
  crTargets?: CrTarget[] | undefined;
  /** D-38: the single view-level selection, owned by the SDLC view and shared with Step 4. */
  selectedSystemId?: string | undefined;
  approvedSolutionMarkdown?: string | undefined;
  savedSnapshot?: BranchSnapshot | undefined;
  onCommitBranchSnapshot?: (snapshot: BranchSnapshot) => Promise<void>;
  /** D-38b: a user-confirmed branch is written back onto the CR target, never guessed. */
  onFeatureBranchChange?: ((systemId: string, branch: string) => void) | undefined;
  onProceedToStep4: () => void;
  onNavigateToStep?: ((step: SdlcStepId) => void) | undefined;
  conventionsSummary?: ConventionsSummaryProps | undefined;
  db?: TaskPlannerDatabase;
}

export const Step3CodeGuideView: React.FC<Step3CodeGuideViewProps> = ({
  targetSystems = [],
  crTargets = [],
  selectedSystemId: selectedSystemIdProp,
  approvedSolutionMarkdown,
  savedSnapshot: initialSavedSnapshot,
  onCommitBranchSnapshot,
  onFeatureBranchChange,
  onProceedToStep4,
  onNavigateToStep,
  conventionsSummary,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const hasApprovedSolution = Boolean(approvedSolutionMarkdown?.trim());

  // D-38: the selection is owned by the SDLC view (shared with Step 4 via the Context Bar).
  const selectedSystemId = selectedSystemIdProp ?? targetSystems[0]?.id ?? '';
  const selectedSystem = useMemo(
    () => targetSystems.find((s) => s.id === selectedSystemId),
    [targetSystems, selectedSystemId]
  );

  // D-38b: the target branch comes from the CR target, never a name heuristic.
  const targetBranch =
    crTargets.find((t) => t.systemId === selectedSystemId)?.featureBranch ?? '';
  const [pendingBranch, setPendingBranch] = useState<string>('');

  // Configuration state
  const [sshConfigs, setSshConfigs] = useState<SshConfig[]>([]);
  const [selectedSshConfigId, setSelectedSshConfigId] = useState<string>('');
  const [remoteRepoPath, setRemoteRepoPath] = useState<string>('');
  const [loadedRepoPath, setLoadedRepoPath] = useState<string>('');
  const [baseBranch, setBaseBranch] = useState<string>('origin/main');

  // Initialize SSH/repo from the selected subsystem (D-36/D-38b) — no settings-backed binding.
  // Reset on every switch: a subsystem without a binding must not inherit the previous one's host.
  useEffect(() => {
    setSelectedSshConfigId(selectedSystem?.sshConfigId ?? '');
    setRemoteRepoPath(selectedSystem?.remoteRepoPath ?? '');
    setLoadedRepoPath(selectedSystem?.remoteRepoPath ?? '');
    setBaseBranch(selectedSystem?.defaultBaseBranch ?? 'origin/main');
  }, [selectedSystem]);

  // Remote data state
  const [branches, setBranches] = useState<RemoteGitBranch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(false);
  const [browserModalOpen, setBrowserModalOpen] = useState<boolean>(false);
  const [dirtyStatus, setDirtyStatus] = useState<RemoteGitStatus | null>(null);
  const [diffSummary, setDiffSummary] = useState<RemoteDiffSummary | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [currentFileDiff, setCurrentFileDiff] = useState<string>('');
  const [fileSearchQuery, setFileSearchQuery] = useState<string>('');

  // Review & snapshot state
  const [currentSnapshot, setCurrentSnapshot] = useState<BranchSnapshot | undefined>(
    initialSavedSnapshot
  );

  useEffect(() => {
    if (initialSavedSnapshot) {
      setCurrentSnapshot(initialSavedSnapshot);
    }
  }, [initialSavedSnapshot]);
  const [driftInfo, setDriftInfo] = useState<{ drifted: boolean; currentHeadSha: string } | null>(
    null
  );

  // UI state
  const [leftWidth, setLeftWidth] = useState<number>(320);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('unified');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingDiff, setLoadingDiff] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active SSH configuration
  const activeSshConfig = useMemo(
    () => sshConfigs.find((c) => c.id === selectedSshConfigId),
    [sshConfigs, selectedSshConfigId]
  );

  // Load available SSH profiles on mount. Repo/SSH/branch config comes from the CR's
  // target subsystems (D-36/D-38b) — there is no settings-backed binding any more.
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const configs = await getSshConfigs(db);
        if (cancelled) return;
        setSshConfigs(configs);
        // Only seed a default when no subsystem is selected; otherwise the subsystem-derived
        // effect above owns SSH/repo and this would clobber it.
        if (!selectedSystemId && configs.length > 0 && configs[0]) {
          setSelectedSshConfigId(configs[0].id);
          if (configs[0].defaultRemotePath) {
            setRemoteRepoPath(configs[0].defaultRemotePath);
            setLoadedRepoPath(configs[0].defaultRemotePath);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setErrorMessage(`Không thể tải cấu hình SSH: ${msg}`);
        }
      }
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [db, selectedSystemId]);

  // Fetch only branches on-demand
  const fetchBranchesOnly = useCallback(async () => {
    if (!activeSshConfig || !remoteRepoPath.trim()) {
      message.warning('Vui lòng chọn cấu hình SSH và nhập đường dẫn repo trước.');
      return;
    }
    setLoadingBranches(true);
    try {
      const secret = (await getSshSecret(activeSshConfig.id)) ?? undefined;
      const branchList = await getRemoteBranches(activeSshConfig, remoteRepoPath.trim(), secret);
      setBranches(branchList);
      message.success(`Đã tải ${branchList.length} nhánh.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(`Không thể tải nhánh: ${msg}`);
    } finally {
      setLoadingBranches(false);
    }
  }, [activeSshConfig, remoteRepoPath]);

  // Fetch branches, check dirty status, and load diff summary
  const fetchRemoteData = useCallback(
    async (pathOverride?: string) => {
      const pathToUse = (pathOverride ?? loadedRepoPath).trim();
      if (!activeSshConfig || !pathToUse) {
        return;
      }
      setLoading(true);
      setErrorMessage(null);

      try {
        const secret = (await getSshSecret(activeSshConfig.id)) ?? undefined;

        // 1. Fetch remote branches (picker options only — D-38b forbids guessing)
        const branchList = await getRemoteBranches(activeSshConfig, pathToUse, secret);
        setBranches(branchList);

        const resolvedTarget = targetBranch;

        // 2. Check working tree dirty status
        const statusResult = await checkDirtyStatus(activeSshConfig, pathToUse, secret);
        setDirtyStatus(statusResult);

        // 3. If target branch resolved, fetch diff summary and commits
        if (resolvedTarget && baseBranch) {
          const summary = await getDiffSummary(
            activeSshConfig,
            pathToUse,
            baseBranch,
            resolvedTarget,
            secret
          );
          setDiffSummary(summary);

          // Check drift if we have an approved snapshot
          if (currentSnapshot && currentSnapshot.headSha) {
            const drift = await checkHeadDrift(
              activeSshConfig,
              pathToUse,
              resolvedTarget,
              currentSnapshot.headSha,
              secret
            );
            setDriftInfo(drift);
          }

          // Auto-select first changed file if none selected
          if (summary.files.length > 0 && summary.files[0]) {
            setSelectedFilePath(summary.files[0].path);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMessage(`Lỗi Git/SSH: ${msg}`);
      } finally {
        setLoading(false);
      }
    },
    [activeSshConfig, loadedRepoPath, targetBranch, baseBranch, currentSnapshot]
  );

  // Trigger query when loaded repository path, branches, or config changes
  useEffect(() => {
    if (activeSshConfig && loadedRepoPath.trim()) {
      void fetchRemoteData();
    }
  }, [activeSshConfig, loadedRepoPath, baseBranch, targetBranch]);

  const handleLoad = useCallback(() => {
    setLoadedRepoPath(remoteRepoPath);
    if (loadedRepoPath === remoteRepoPath) {
      void fetchRemoteData(remoteRepoPath);
    }
  }, [remoteRepoPath, loadedRepoPath, fetchRemoteData]);

  // Load single file diff when selectedFilePath changes
  useEffect(() => {
    let cancelled = false;
    async function loadDiff() {
      if (!activeSshConfig || !remoteRepoPath.trim() || !baseBranch || !targetBranch || !selectedFilePath) {
        setCurrentFileDiff('');
        return;
      }
      setLoadingDiff(true);
      try {
        const secret = (await getSshSecret(activeSshConfig.id)) ?? undefined;
        const diffText = await getFileDiff(
          activeSshConfig,
          remoteRepoPath,
          baseBranch,
          targetBranch,
          selectedFilePath,
          secret
        );
        if (!cancelled) {
          setCurrentFileDiff(diffText);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setCurrentFileDiff('');
        }
      } finally {
        if (!cancelled) {
          setLoadingDiff(false);
        }
      }
    }
    void loadDiff();
    return () => {
      cancelled = true;
    };
  }, [activeSshConfig, remoteRepoPath, baseBranch, targetBranch, selectedFilePath]);

  // Approve review handler
  const handleApproveReview = async () => {
    if (!diffSummary) return;

    const snapshot: BranchSnapshot = {
      sshConfigId: selectedSshConfigId,
      remoteRepoPath,
      baseBranch,
      targetBranch,
      branch: targetBranch,
      baseCommit: baseBranch,
      headSha: diffSummary.headSha,
      headCommit: diffSummary.headSha,
      commitCount: diffSummary.commits.length,
      commitShas: diffSummary.commits.map((c) => c.sha),
      filesChangedCount: diffSummary.files.length,
      fileStats: diffSummary.files,
      filesSummary: diffSummary.files,
      totalAdditions: diffSummary.totalAdditions,
      totalDeletions: diffSummary.totalDeletions,
      approvedAt: new Date().toISOString(),
    };

    setCurrentSnapshot(snapshot);
    setDriftInfo(null);

    if (onCommitBranchSnapshot) {
      try {
        await onCommitBranchSnapshot(snapshot);
        message.success('Đã lưu snapshot nhánh thành công!');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        message.error(`Không thể lưu snapshot: ${msg}`);
      }
    } else {
      message.success('Đã lưu snapshot nhánh thành công!');
    }
  };

  // Re-inspect drift handler
  const handleReInspectDrift = async () => {
    await fetchRemoteData();
    message.info('Đã kiểm tra lại trạng thái remote repository.');
  };

  // Filter changed files
  const filteredFiles = useMemo(() => {
    if (!diffSummary) return [];
    if (!fileSearchQuery.trim()) return diffSummary.files;
    const q = fileSearchQuery.toLowerCase();
    return diffSummary.files.filter((f) => f.path.toLowerCase().includes(q));
  }, [diffSummary, fileSearchQuery]);

  const getStatusTag = (status: RemoteFileStat['status']) => {
    switch (status) {
      case 'added':
        return <Tag color="success" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>[A]</Tag>;
      case 'deleted':
        return <Tag color="error" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>[D]</Tag>;
      case 'renamed':
        return <Tag color="processing" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>[R]</Tag>;
      case 'modified':
      default:
        return <Tag color="warning" style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>[M]</Tag>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      {/* Step Header */}
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bước 3: Review Nhánh & Diff Repository Remote qua SSH
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
          Kết nối SSH đến máy chủ/WSL, kiểm tra lịch sử commit và xem trước diff thay đổi trước khi đóng gói Change Pack.
        </Typography.Paragraph>
      </div>

      {/* Conventions Summary Card */}
      {conventionsSummary && (
        <ConventionsSummaryCard {...conventionsSummary} />
      )}

      {/* Prerequisite Guard Alert if SOLUTION is not approved */}
      {!hasApprovedSolution && (
        <Alert
          type="error"
          showIcon
          data-testid="step3-prerequisite-guard"
          message={formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK')}
          description="Tài liệu bắt buộc: SOLUTION.md đã được phê duyệt ở Bước 2. Chưa có tài liệu này thì hợp đồng bàn giao và Change Pack không có phạm vi đối chiếu."
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

      {/* Top Configuration Bar */}
      <Card
        size="small"
        style={{
          border: `1px solid ${token.colorBorderSecondary}`,
          backgroundColor: token.colorFillAlter,
        }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {/* SSH Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
              Cấu hình SSH:
            </span>
            <Select
              size="small"
              style={{ width: 180 }}
              placeholder="Chọn cấu hình SSH"
              value={selectedSshConfigId || undefined}
              onChange={(val) => {
                const chosenId = val ?? '';
                setSelectedSshConfigId(chosenId);
                const cfg = sshConfigs.find((c) => c.id === chosenId);
                if (cfg?.defaultRemotePath && !remoteRepoPath) {
                  setRemoteRepoPath(cfg.defaultRemotePath);
                }
              }}
              options={sshConfigs.map((c) => ({
                label: `${c.name} (${c.username}@${c.host})`,
                value: c.id,
              }))}
            />
          </div>

          {/* Remote Repo Path */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
              Repo remote:
            </span>
            <Input
              size="small"
              prefix={<FolderOpenOutlined style={{ color: token.colorTextTertiary }} />}
              placeholder="/home/user/workspace/repo"
              value={remoteRepoPath}
              onChange={(e) => setRemoteRepoPath(e.target.value)}
              onPressEnter={handleLoad}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <Button
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={() => setBrowserModalOpen(true)}
              disabled={!activeSshConfig}
            >
              Duyệt...
            </Button>
          </div>

          {/* Base Branch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
              Base:
            </span>
            <Select
              size="small"
              showSearch
              style={{ width: 150, fontFamily: 'monospace', fontSize: 12 }}
              value={baseBranch}
              onChange={(val) => setBaseBranch(val)}
              options={
                branches.length > 0
                  ? branches.map((b) => ({ label: b.name, value: b.name }))
                  : [
                      { label: 'origin/main', value: 'origin/main' },
                      { label: 'origin/master', value: 'origin/master' },
                      { label: 'staging', value: 'staging' },
                      { label: 'master', value: 'master' },
                      { label: 'main', value: 'main' },
                    ]
              }
            />
            <Button
              size="small"
              icon={<ReloadOutlined spin={loadingBranches} />}
              onClick={fetchBranchesOnly}
              title="Tải lại danh sách nhánh"
            />
          </div>

          {/* Target Branch — D-38b: read from the CR target; pick when the target has none */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
              Compare:
            </span>
            {targetBranch ? (
              <Tag color="cyan" style={{ margin: 0, fontFamily: 'monospace', fontSize: 12 }}>
                {targetBranch}
              </Tag>
            ) : (
              <>
                <Select
                  size="small"
                  showSearch
                  data-testid="step3-branch-picker"
                  style={{ width: 180, fontFamily: 'monospace', fontSize: 12 }}
                  placeholder="Chọn nhánh review"
                  value={pendingBranch || undefined}
                  onChange={(val) => setPendingBranch(val ?? '')}
                  options={branches.map((b) => ({ label: b.name, value: b.name }))}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                />
                <Button
                  size="small"
                  type="primary"
                  disabled={!pendingBranch || !selectedSystemId}
                  onClick={() => {
                    if (!pendingBranch || !selectedSystemId) return;
                    onFeatureBranchChange?.(selectedSystemId, pendingBranch);
                    setPendingBranch('');
                  }}
                >
                  Xác nhận nhánh
                </Button>
              </>
            )}
          </div>

          {/* Load Changes Button */}
          <Button
            size="small"
            type="primary"
            icon={<SearchOutlined />}
            onClick={handleLoad}
            loading={loading}
            disabled={!activeSshConfig || !remoteRepoPath.trim()}
          >
            So sánh thay đổi
          </Button>
        </div>
      </Card>

      {/* Error Alert */}
      {errorMessage && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setErrorMessage(null)}
          message="Lỗi kết nối SSH hoặc lệnh Git"
          description={errorMessage}
        />
      )}

      {/* Dirty Working Tree Alert Banner */}
      {dirtyStatus && !dirtyStatus.isClean && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message={`Thư mục làm việc remote có ${dirtyStatus.uncommittedFiles.length} tệp chưa commit. Kết quả review bên dưới chỉ hiển thị các commit đã tạo giữa ${baseBranch} và ${targetBranch}.`}
          description={
            <div style={{ marginTop: 4, maxHeight: 80, overflowY: 'auto' }}>
              {dirtyStatus.uncommittedFiles.slice(0, 5).map((f, i) => (
                <div key={i} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  <Tag color="default" style={{ fontSize: 11, padding: '0 4px', marginRight: 6 }}>
                    {f.indexStatus || ' '}{f.workingTreeStatus || ' '}
                  </Tag>
                  {f.path}
                </div>
              ))}
              {dirtyStatus.uncommittedFiles.length > 5 && (
                <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 2 }}>
                  ... và {dirtyStatus.uncommittedFiles.length - 5} tệp khác
                </div>
              )}
            </div>
          }
        />
      )}

      {/* Remote HEAD Drift Alert Banner */}
      {driftInfo && driftInfo.drifted && currentSnapshot && (
        <Alert
          type="warning"
          showIcon
          message={`Remote HEAD đã thay đổi so với snapshot đã duyệt (${(currentSnapshot.headSha ?? '').slice(0, 8)} → ${driftInfo.currentHeadSha.slice(0, 8)}). Nhấn "Kiểm tra lại" để cập nhật.`}
          action={
            <Button size="small" type="primary" onClick={handleReInspectDrift}>
              Kiểm tra lại & Cập nhật snapshot
            </Button>
          }
        />
      )}

      {/* Approved Snapshot Banner */}
      {currentSnapshot && (!driftInfo || !driftInfo.drifted) && (
        <Alert
          type="success"
          showIcon
          message={`Đã lưu snapshot nhánh thành công vào lúc ${new Date(currentSnapshot.approvedAt).toLocaleTimeString()}. Có thể tiếp tục sang Bước 4.`}
        />
      )}

      {/* 2-Column Review Pane */}
      {!activeSshConfig || !remoteRepoPath ? (
        <Card style={{ border: `1px solid ${token.colorBorderSecondary}`, textAlign: 'center', padding: 40 }}>
          <Empty
            description={
              <div>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  Chưa kết nối SSH hoặc chưa chọn repository
                </Typography.Text>
                <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 13 }}>
                  Chọn cấu hình SSH và đường dẫn repository remote ở thanh bên trên để bắt đầu kiểm tra.
                </Typography.Paragraph>
              </div>
            }
          />
        </Card>
      ) : loading && !diffSummary ? (
        <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <Spin size="large" />
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Đang truy vấn repository remote qua SSH...
          </Typography.Text>
        </div>
      ) : diffSummary && diffSummary.commits.length === 0 && diffSummary.files.length === 0 ? (
        <Card style={{ border: `1px solid ${token.colorBorderSecondary}`, textAlign: 'center', padding: 40 }}>
          <Empty
            description={
              <div>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  Không có thay đổi Git nào
                </Typography.Text>
                <Typography.Paragraph type="secondary" style={{ marginTop: 8, fontSize: 13 }}>
                  Nhánh {targetBranch} đồng nhất với nhánh gốc {baseBranch}. Không tìm thấy commit hoặc diff nào cần review.
                </Typography.Paragraph>
              </div>
            }
          />
        </Card>
      ) : (
        <div
          data-testid="two-column-review-pane"
          style={{
            display: 'flex',
            ...(isFullscreen
              ? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 1050,
                  height: '100vh',
                  width: '100vw',
                  backgroundColor: token.colorBgContainer,
                  borderRadius: 0,
                }
              : {
                  height: 600,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: 8,
                }),
            overflow: 'hidden',
          }}
        >
          {/* Left Panel: Commits & Changed Files */}
          <div
            style={{
              width: leftWidth,
              minWidth: 260,
              maxWidth: 480,
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: token.colorFillAlter,
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              overflow: 'hidden',
            }}
          >
            {/* Sub-section 1: Commit Timeline */}
            <div
              style={{
                height: 220,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  fontWeight: 600,
                  fontSize: 12,
                  color: token.colorTextSecondary,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>Lịch sử Commit ({diffSummary?.commits.length ?? 0})</span>
                <BranchesOutlined />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {diffSummary?.commits.map((c) => (
                  <div
                    key={c.sha}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag
                        color="blue"
                        style={{
                          margin: 0,
                          fontSize: 11,
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          padding: '0 4px',
                        }}
                      >
                        {c.shortSha}
                      </Tag>
                      <span
                        style={{
                          fontSize: 11,
                          color: token.colorTextSecondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {c.author} · {c.date.split('T')[0] || c.date}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: token.colorText,
                      }}
                      title={c.message}
                    >
                      {c.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sub-section 2: Changed Files Tree */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div
                style={{
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 12, color: token.colorTextSecondary }}>
                  Tệp thay đổi ({diffSummary?.files.length ?? 0})
                </span>
                {diffSummary && (
                  <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                    <span style={{ color: '#52c41a', fontWeight: 600 }}>+{diffSummary.totalAdditions}</span>
                    {' · '}
                    <span style={{ color: '#ff4d4f', fontWeight: 600 }}>−{diffSummary.totalDeletions}</span>
                  </span>
                )}
              </div>

              {/* Quick Search */}
              <div style={{ padding: '6px 10px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                <Input
                  size="small"
                  prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
                  placeholder="Lọc tệp..."
                  value={fileSearchQuery}
                  onChange={(e) => setFileSearchQuery(e.target.value)}
                  allowClear
                />
              </div>

              {/* File list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredFiles.map((f) => {
                  const isSelected = f.path === selectedFilePath;
                  return (
                    <div
                      key={f.path}
                      onClick={() => setSelectedFilePath(f.path)}
                      style={{
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        fontSize: 12,
                        backgroundColor: isSelected ? token.colorPrimaryBg : 'transparent',
                        borderLeft: isSelected ? `3px solid ${token.colorPrimary}` : '3px solid transparent',
                        transition: 'background-color 0.1s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          overflow: 'hidden',
                          flex: 1,
                        }}
                      >
                        {getStatusTag(f.status)}
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: isSelected ? token.colorPrimary : token.colorText,
                            fontWeight: isSelected ? 600 : 400,
                          }}
                          title={f.path}
                        >
                          {f.path}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          flexShrink: 0,
                          marginLeft: 6,
                          color: token.colorTextSecondary,
                        }}
                      >
                        {f.additions > 0 && <span style={{ color: '#52c41a' }}>+{f.additions}</span>}
                        {f.additions > 0 && f.deletions > 0 && ' '}
                        {f.deletions > 0 && <span style={{ color: '#ff4d4f' }}>−{f.deletions}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Splitter */}
          <ResizeSplitter
            side="left"
            currentWidth={leftWidth}
            minWidth={260}
            maxWidth={480}
            onResize={setLeftWidth}
          />

          {/* Right Panel: Diff Viewer */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {loadingDiff ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin tip="Đang tải diff tệp..." />
              </div>
            ) : (
              <RemoteDiffViewer
                rawDiff={currentFileDiff}
                filePath={selectedFilePath}
                viewMode={diffViewMode}
                onViewModeChange={setDiffViewMode}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              />
            )}
          </div>
        </div>
      )}

      {/* Action & Approval Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div>
          {currentSnapshot ? (
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
              <Typography.Text strong style={{ fontSize: 13 }}>
                Đã duyệt snapshot: {new Date(currentSnapshot.approvedAt).toLocaleDateString()} (HEAD: {(currentSnapshot.headSha ?? '').slice(0, 8)})
              </Typography.Text>
            </Space>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Trạng thái: Chưa duyệt snapshot nhánh
            </Typography.Text>
          )}
        </div>

        <Space orientation="horizontal" size={12}>
          <Button
            type="primary"
            size="large"
            icon={<CheckCircleOutlined />}
            onClick={handleApproveReview}
            disabled={!hasApprovedSolution || !diffSummary}
          >
            Chấp thuận kết quả review
          </Button>

          <Button
            size="large"
            icon={<ArrowRightOutlined />}
            disabled={!hasApprovedSolution || !currentSnapshot}
            onClick={onProceedToStep4}
          >
            Chuyển sang Bước 4: Change Pack
          </Button>
        </Space>
      </div>

      {/* Remote Directory Browser Modal */}
      <RemoteDirectoryBrowserModal
        open={browserModalOpen}
        sshConfig={activeSshConfig}
        initialPath={remoteRepoPath}
        onSelect={(selectedPath) => {
          setRemoteRepoPath(selectedPath);
          setBrowserModalOpen(false);
        }}
        onCancel={() => setBrowserModalOpen(false)}
      />
    </div>
  );
};
