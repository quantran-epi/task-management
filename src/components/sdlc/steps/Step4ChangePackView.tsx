import React, { useState, useEffect } from 'react';
import { Typography, Alert, Button, message, Spin, theme } from 'antd';
import { ArrowRightOutlined, UploadOutlined, SyncOutlined } from '@ant-design/icons';
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

export interface Step4ChangePackViewProps {
  projectId: string;
  crId: string;
  crCode: string;
  solutionArtifact?: SdlcArtifactRef | undefined;
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

export const Step4ChangePackView: React.FC<Step4ChangePackViewProps> = ({
  projectId,
  crId,
  crCode,
  solutionArtifact,
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

      // 3. Summarize drift counts
      const outsideSolution = reconciliation.drift.filter((d) => d.category === 'outside_solution').length;
      const missingImplementation = reconciliation.drift.filter((d) => d.category === 'missing').length;
      const divergent = reconciliation.drift.filter((d) => d.category === 'different').length;

      const newHistoryItem: ChangePackHistoryItem = {
        hash: manifest.packHash,
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        fileSize: file.size,
        manifest: persistableManifest(manifest),
        driftSummary: {
          outsideSolution,
          missingImplementation,
          divergent,
        },
      };

      // 4. Update multi-pack state (mark new pack as active)
      const existingWithoutCurrent = multiPackState.packs.filter((p) => p.hash !== manifest.packHash);
      const nextState: MultiPackState = {
        activePackHash: manifest.packHash,
        packs: [newHistoryItem, ...existingWithoutCurrent],
      };

      await saveMultiPackState(projectId, crId, nextState, db);
      setMultiPackState(nextState);
      setDriftResult(reconciliation);

      // 5. Commit to workflow coordinator
      await onCommitChangePackAndDrift(manifest.packHash, file.name, reconciliation);
      message.success(`Đã nạp và đối chiếu thành công pack: ${file.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Nạp file thất bại';
      setErrorMsg(`Lỗi xác thực change pack: ${msg}`);
    } finally {
      setLoading(false);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1000 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bước 4: Nạp Change Pack & Đối chiếu Drift (Multi-Pack)
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
          Tải lên các bản đóng gói zip code thực tế. Hệ thống hỗ trợ lưu nhiều phiên bản pack, chọn 1 pack ACTIVE để đối chiếu drift so với SOLUTION.md đã duyệt.
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

      {/* Upload Dropzone */}
      <div style={{ background: token.colorBgContainer, padding: 16, borderRadius: token.borderRadiusSM, border: `1px dashed ${token.colorBorder}` }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
          <UploadOutlined /> Tải lên bản đóng gói mới (.zip) cho CR {crCode}:
        </Typography.Text>
        <ChangePackDropzone onSelect={handleSelectFile} disabled={!solutionArtifact} />
      </div>

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
    </div>
  );
};
