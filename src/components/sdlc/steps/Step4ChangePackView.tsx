import React, { useState, useEffect } from 'react';
import { Typography, Alert, Button, Space, message, Spin, theme } from 'antd';
import { ArrowRightOutlined, UploadOutlined, SyncOutlined } from '@ant-design/icons';
import { db as defaultDb, type TaskPlannerDatabase } from '../../../db';
import { ChangePackDropzone } from '../../ai/wizard/ChangePackDropzone';
import { DriftMatrixView } from '../../ai/wizard/DriftMatrixView';
import { MultiPackTable } from '../pack/MultiPackTable';
import { validateHubChangePack } from '../../../services/wizard/hubChangePack';
import {
  reconcileSolutionWithPack,
  type ReconciliationResult,
} from '../../../services/wizard/reconciliation';
import {
  getMultiPackState,
  saveMultiPackState,
  type ChangePackHistoryItem,
  type MultiPackState,
} from '../../../services/wizard/sdlcCrManager';
import type { SdlcArtifactRef } from '../../../services/wizard/workflowSchemas';

export interface Step4ChangePackViewProps {
  projectId: string;
  crId: string;
  crCode: string;
  solutionArtifact?: SdlcArtifactRef;
  initialDriftResult?: ReconciliationResult;
  onCommitChangePackAndDrift: (
    packHash: string,
    packTitle: string,
    driftResult: ReconciliationResult
  ) => Promise<void>;
  onProceedToStep5?: () => void;
  db?: TaskPlannerDatabase;
}

export const Step4ChangePackView: React.FC<Step4ChangePackViewProps> = ({
  projectId,
  crId,
  crCode,
  solutionArtifact,
  initialDriftResult,
  onCommitChangePackAndDrift,
  onProceedToStep5,
  db = defaultDb,
}) => {
  const { token } = theme.useToken();
  const [loading, setLoading] = useState<boolean>(false);
  const [multiPackState, setMultiPackState] = useState<MultiPackState>({ packs: [] });
  const [driftResult, setDriftResult] = useState<ReconciliationResult | undefined>(initialDriftResult);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load multipack history from db
  useEffect(() => {
    let mounted = true;
    getMultiPackState(projectId, crId, db).then((state) => {
      if (mounted) {
        setMultiPackState(state);
      }
    });
    return () => {
      mounted = false;
    };
  }, [projectId, crId, db]);

  // Handle upload of a zip pack
  const handleSelectFile = async (file: File) => {
    if (!solutionArtifact) {
      setErrorMsg('Chưa có SOLUTION.md đã duyệt từ Bước 2. Vui lòng quay lại Bước 2 để hoàn thành.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      // 1. Validate change-pack identity & size against expected CR
      const manifest = await validateHubChangePack(file, crCode);

      // 2. Perform reconciliation with solution
      const reconciliation = reconcileSolutionWithPack({
        projectId,
        threadId: `sdlc:${projectId}:${crId}:CHANGE_PACK`,
        solutionNoteId: solutionArtifact.noteId ?? 'solution-note',
        solutionVersion: solutionArtifact.version,
        solutionHash: solutionArtifact.hash,
        packHash: manifest.packHash,
        cr: crCode,
        base: manifest.identity.base,
        head: manifest.identity.head,
        requirements: [],
        approvedDesign: {
          currentSystem: solutionArtifact.content ?? '',
          affectedScreens: [],
          affectedApis: [],
          affectedTables: [],
        },
        evidence: [],
        hunks: [],
      });

      // 3. Summarize drift counts
      const outsideSolution = reconciliation.drift.filter((d) => d.category === 'outside_solution').length;
      const missingImplementation = reconciliation.drift.filter((d) => d.category === 'missing').length;
      const divergent = reconciliation.drift.filter((d) => d.category === 'different').length;

      const newHistoryItem: ChangePackHistoryItem = {
        hash: manifest.packHash,
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        fileSize: file.size,
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

    // Reconcile with the newly activated pack
    const reconciliation = reconcileSolutionWithPack({
      projectId,
      threadId: `sdlc:${projectId}:${crId}:CHANGE_PACK`,
      solutionNoteId: solutionArtifact.noteId ?? 'solution-note',
      solutionVersion: solutionArtifact.version,
      solutionHash: solutionArtifact.hash,
      packHash,
      cr: crCode,
      base: 'base-commit',
      head: 'head-commit',
      requirements: [],
      approvedDesign: {
        currentSystem: solutionArtifact.content ?? '',
        affectedScreens: [],
        affectedApis: [],
        affectedTables: [],
      },
      evidence: [],
      hunks: [],
    });

    setDriftResult(reconciliation);
    await onCommitChangePackAndDrift(packHash, pack.filename, reconciliation);
    message.info(`Đã chuyển active pack sang: ${pack.filename}`);
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
          message="Chưa có SOLUTION.md đã duyệt"
          description="Bạn cần hoàn tất và duyệt tài liệu SOLUTION.md ở Bước 2 trước khi nạp change pack để đối chiếu."
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

      {/* Upload Dropzone */}
      <div style={{ background: token.colorBgContainer, padding: 16, borderRadius: token.borderRadiusSM, border: `1px dashed ${token.colorBorder}` }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 12 }}>
          <UploadOutlined /> Tải lên bản đóng gói mới (.zip) cho CR {crCode}:
        </Typography.Text>
        <ChangePackDropzone onSelect={handleSelectFile} />
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
