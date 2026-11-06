import React, { useState, useEffect } from 'react';
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
  Steps,
} from 'antd';
import {
  ArrowRightOutlined,
  UploadOutlined,
  SyncOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { ChangePackDropzone } from '../../ai/wizard/ChangePackDropzone';
import { DriftMatrixView } from '../../ai/wizard/DriftMatrixView';
import { MultiPackTable } from '../pack/MultiPackTable';
import { buildHubReconciliation, validateHubChangePack } from '../../../services/wizard/hubChangePack';
import type { ReconciliationResult } from '../../../services/wizard/reconciliation';
import type { ChangePackManifest } from '../../../services/wizard/changePack';
import { formatGuardMessage } from '../../../services/wizard/workflowGuards';
import {
  getMultiPackState,
  saveMultiPackState,
  type ChangePackHistoryItem,
  type MultiPackState,
} from '../../../services/wizard/sdlcCrManager';
import type { SdlcArtifactRef, SdlcStepId } from '../../../services/wizard/workflowSchemas';
import type { BranchSnapshot } from '../../../types/gitRemote';
import { getProjectRepoSshBinding } from '../../../services/gitRemoteService';
import { getSshConfigs } from '../../../services/sshService';
import {
  createChangePackFromSnapshot,
  type PackageProgressStep,
} from '../../../services/changePackPackager';

export interface Step4ChangePackViewProps {
  projectId: string;
  crId: string;
  crCode: string;
  solutionArtifact?: SdlcArtifactRef | undefined;
  branchSnapshot?: BranchSnapshot | undefined;
  initialDriftResult?: ReconciliationResult | undefined;
  onCommitChangePackAndDrift: (
    packHash: string,
    packTitle: string,
    driftResult: ReconciliationResult
  ) => Promise<void>;
  /** Navigates to the step that supplies the missing prerequisite (D-20). */
  onNavigateToStep?: ((step: SdlcStepId) => void) | undefined;
  onProceedToStep5?: (() => void) | undefined;
  db?: TaskPlannerDatabase | undefined;
}

/** The SOLUTION Note pins against the SOLUTION thread, not the CHANGE_PACK thread. */
function solutionThreadId(projectId: string, crId: string): string {
  return `sdlc:${projectId}:${crId}:SOLUTION`;
}

/** Manifest minus raw entry bytes: only identity + path/status/coverage are needed to reconcile. */
function persistableManifest(manifest: Readonly<ChangePackManifest>): ChangePackManifest {
  return {
    ...manifest,
    entries: manifest.entries.map((entry) => ({ ...entry, content: '' })),
  };
}

/** Service progress phases collapse into the four user-visible packaging stages (D-04). */
const PACKAGE_STEP_INDEX: Record<PackageProgressStep, number> = {
  checking: 0,
  diff: 0,
  files: 1,
  compressing: 2,
  validating: 2,
};

const PACKAGING_STAGES = [
  { title: 'Kiểm tra remote & tạo diff.patch' },
  { title: 'Thu thập tệp mới & SQL' },
  { title: 'Nén JSZip in-memory' },
  { title: 'Đối soát Drift Matrix' },
];

const SSH_PACKAGING_ERROR =
  'Không thể kết nối SSH hoặc đóng gói thất bại. Vui lòng kiểm tra cấu hình kết nối hoặc nạp tệp zip thủ công.';

export const Step4ChangePackView: React.FC<Step4ChangePackViewProps> = ({
  projectId,
  crId,
  crCode,
  solutionArtifact,
  branchSnapshot,
  initialDriftResult,
  onCommitChangePackAndDrift,
  onNavigateToStep,
  onProceedToStep5,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsReupload, setNeedsReupload] = useState(false);
  const [multiPackState, setMultiPackState] = useState<MultiPackState>({ packs: [] });
  const [driftResult, setDriftResult] = useState<ReconciliationResult | undefined>(initialDriftResult);

  // Auto-packaging state (D-01, D-04)
  const [packagingLoading, setPackagingLoading] = useState(false);
  const [packagingStep, setPackagingStep] = useState(0);
  const [packagingStepStatus, setPackagingStepStatus] = useState<'process' | 'finish' | 'error' | 'wait'>('wait');
  const [packagingWarnings, setPackagingWarnings] = useState<string[]>([]);
  // D-03: without an approved snapshot the manual fallback opens straight away.
  const [manualAccordionOpen, setManualAccordionOpen] = useState(!branchSnapshot);

  useEffect(() => {
    if (!branchSnapshot) setManualAccordionOpen(true);
  }, [branchSnapshot]);

  // Load multipack state from DB
  useEffect(() => {
    let cancelled = false;
    async function loadPacks() {
      const state = await getMultiPackState(projectId, crId, db);
      if (!cancelled) {
        setMultiPackState(state);
      }
    }
    loadPacks();
    return () => {
      cancelled = true;
    };
  }, [projectId, crId, db]);

  const reconcile = (manifest: ChangePackManifest): Promise<ReconciliationResult> => {
    if (!solutionArtifact?.noteId) {
      return Promise.reject(new Error('SOLUTION_REQUIRED_FOR_CHANGE_PACK'));
    }
    return buildHubReconciliation({
      db,
      projectId,
      threadId: solutionThreadId(projectId, crId),
      manifest,
      solutionNoteId: solutionArtifact.noteId,
      solutionVersion: solutionArtifact.version,
      solutionHash: solutionArtifact.hash,
    });
  };

  /** Persists a freshly produced manifest as the active pack and pushes drift to the coordinator. */
  const commitPack = async (
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

    await saveMultiPackState(projectId, crId, nextState, db);
    setMultiPackState(nextState);
    setDriftResult(reconciliation);
    await onCommitChangePackAndDrift(manifest.packHash, filename, reconciliation);
  };

  const handleSelectFile = async (file: File) => {
    if (!solutionArtifact) {
      setErrorMsg(formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK'));
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setNeedsReupload(false);

      // 1. Validate change-pack identity & size against expected CR
      const manifest = await validateHubChangePack(file, crCode);

      // 2. Reconcile against the real pinned SOLUTION Note
      const reconciliation = await reconcile(persistableManifest(manifest));

      // 3. Mark as active pack & commit to workflow coordinator
      await commitPack(manifest, file.name, file.size, reconciliation);
      message.success(`Đã nạp và đối chiếu thành công pack: ${file.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nạp file thất bại';
      setErrorMsg(`Lỗi xác thực change pack: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  /** D-01/D-02: active trigger builds the pack over SSH and reconciles it immediately. */
  const handlePackageFromSnapshot = async () => {
    if (!branchSnapshot || packagingLoading) return;
    if (!solutionArtifact?.noteId) {
      setErrorMsg(formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK'));
      setManualAccordionOpen(true);
      return;
    }

    setPackagingLoading(true);
    setPackagingWarnings([]);
    setPackagingStep(0);
    setPackagingStepStatus('process');
    setErrorMsg(null);
    setNeedsReupload(false);

    try {
      const binding = await getProjectRepoSshBinding(projectId, db);
      const sshConfigId = binding?.sshConfigId ?? branchSnapshot.sshConfigId;
      const repoPath = binding?.remoteRepoPath ?? branchSnapshot.remoteRepoPath;
      const configs = await getSshConfigs(db);
      const config = sshConfigId ? configs.find((c) => c.id === sshConfigId) : undefined;
      if (!config || !repoPath) {
        // D-11: surface the failure and open the manual fallback immediately.
        setPackagingStepStatus('error');
        setErrorMsg(SSH_PACKAGING_ERROR);
        setManualAccordionOpen(true);
        return;
      }

      const packaged = await createChangePackFromSnapshot(config, repoPath, branchSnapshot, crCode, (step) => {
        setPackagingStep(PACKAGE_STEP_INDEX[step]);
        setPackagingStepStatus('process');
      });
      setPackagingWarnings(packaged.warnings);

      setPackagingStep(3);
      setPackagingStepStatus('process');
      const manifest = await validateHubChangePack(packaged.blob, crCode);
      const reconciliation = await reconcile(persistableManifest(manifest));

      const filename = `${crCode}-${manifest.identity.head.slice(0, 8)}.zip`;
      await commitPack(manifest, filename, packaged.blob.size, reconciliation);

      setPackagingStepStatus('finish');
      message.success(`Đã đóng gói và đối chiếu thành công từ Snapshot: ${filename}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPackagingStepStatus('error');
      setErrorMsg(`Lỗi đóng gói change pack: ${msg}`);
      setManualAccordionOpen(true);
    } finally {
      setPackagingLoading(false);
    }
  };

  const handleSelectActive = async (packHash: string) => {
    const pack = multiPackState.packs.find((p) => p.hash === packHash);
    if (!pack || !solutionArtifact) return;

    const nextState: MultiPackState = {
      ...multiPackState,
      activePackHash: packHash,
    };

    await saveMultiPackState(projectId, crId, nextState, db);
    setMultiPackState(nextState);

    // Rows written before manifests were persisted carry no identity to reconcile from.
    // Fabricating base/head to fill the gap would fake evidence pins, so ask for re-upload.
    if (!pack.manifest) {
      setNeedsReupload(true);
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      setNeedsReupload(false);
      const reconciliation = await reconcile(pack.manifest);
      setDriftResult(reconciliation);
      await onCommitChangePackAndDrift(packHash, pack.filename, reconciliation);
      message.info(`Đã chuyển active pack sang: ${pack.filename}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đối soát thất bại';
      setErrorMsg(`Lỗi xác thực change pack: ${msg}`);
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
    await saveMultiPackState(projectId, crId, nextState, db);
    setMultiPackState(nextState);
    message.success('Đã xóa pack khỏi lịch sử');
  };

  const shortSha = (sha: string | undefined): string => (sha ? sha.slice(0, 8) : '—');
  const snapshotFileCount = branchSnapshot?.filesChangedCount ?? branchSnapshot?.fileStats?.length ?? 0;
  const showStepper = packagingLoading || packagingStep > 0;
  const stepStatus = (index: number): 'wait' | 'process' | 'finish' | 'error' =>
    index < packagingStep ? 'finish' : index === packagingStep ? packagingStepStatus : 'wait';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bước 4: Nạp Change Pack & Đối chiếu Drift (Multi-Pack)
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
          Đóng gói tự động từ Branch Snapshot đã duyệt qua SSH, hoặc nạp bản đóng gói zip thủ công ở khu vực dự phòng. Mỗi lần đóng gói tạo một pack mới trong lịch sử và tự động đặt làm ACTIVE để đối chiếu drift so với SOLUTION.md.
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

      {/* D-01: Snapshot summary card is the primary focal point; D-03: warn when absent. */}
      {branchSnapshot ? (
        <Card
          size="small"
          title={
            <Space size={8}>
              <BranchesOutlined />
              <span>Branch Snapshot đã duyệt (Bước 3)</span>
            </Space>
          }
          extra={
            <Tag color="success" icon={<CheckCircleOutlined />}>
              Đã phê duyệt
            </Tag>
          }
          style={{ background: token.colorBgContainer, borderColor: token.colorPrimaryBorder }}
        >
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Space size={16} wrap>
              <span>
                <Typography.Text type="secondary">Nhánh: </Typography.Text>
                <Tag color="blue">{branchSnapshot.targetBranch ?? branchSnapshot.branch ?? '—'}</Tag>
              </span>
              <span>
                <Typography.Text type="secondary">Base: </Typography.Text>
                <Typography.Text code>{shortSha(branchSnapshot.baseCommit ?? branchSnapshot.baseBranch)}</Typography.Text>
              </span>
              <span>
                <Typography.Text type="secondary">Head: </Typography.Text>
                <Typography.Text code>
                  {shortSha(branchSnapshot.headSha ?? branchSnapshot.headCommit)}
                </Typography.Text>
              </span>
              <span>
                <Typography.Text type="secondary">Tệp thay đổi: </Typography.Text>
                <Typography.Text strong>{snapshotFileCount}</Typography.Text>
              </span>
            </Space>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              loading={packagingLoading}
              disabled={packagingLoading || !solutionArtifact}
              onClick={handlePackageFromSnapshot}
              data-testid="btn-package-from-snapshot"
            >
              Đóng gói & Đối chiếu từ Snapshot
            </Button>
          </Space>
        </Card>
      ) : (
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

      {/* D-04: four-stage packaging progress. */}
      {showStepper && (
        <div
          data-testid="packaging-stepper"
          style={{
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusSM,
            padding: 20,
          }}
        >
          <Steps
            size="small"
            items={PACKAGING_STAGES.map((stage, index) => ({
              title: stage.title,
              status: stepStatus(index),
            }))}
          />
        </div>
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

      {errorMsg && (
        <Alert
          type="error"
          showIcon
          closable
          onClose={() => setErrorMsg(null)}
          message={errorMsg}
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
            onSelectActive={handleSelectActive}
            onDeletePack={handleDeletePack}
          />
        </div>
      )}

      {/* Drift Matrix Breakdown */}
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
