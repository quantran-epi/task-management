import { Alert, Button, Checkbox, List, Modal, Space, Spin, Statistic, Tabs, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import type { ChangePreview, DeltaClassification } from '../../services/knowledge/changePreview';
import type { PublishSession } from '../../services/knowledge/publishOrchestrator';
import type { DlpFinding } from '../../types/dlp';
import type { PublishPrimaryState } from '../../types/models';
import { DlpWarningPanel } from './DlpWarningPanel';
import { PublishProgressPanel, type AtomicBlockErrorDetails } from './PublishProgressPanel';

const { Text } = Typography;
const LABELS: Record<DeltaClassification, string> = {
  added: 'Thêm',
  changed: 'Thay đổi',
  removed: 'Gỡ khỏi máy chủ',
  unchanged: 'Không đổi',
};

type Step = 'preview' | 'scanning' | 'review' | 'publishing';

export interface PublishPreviewModalProps {
  open: boolean;
  preview: ChangePreview;
  session: PublishSession;
  documentTitles?: Readonly<Record<string, string>>;
  onClose: () => void;
  onOpenStatus?: () => void;
  onAnnounce?: (message: string) => void;
}

export function PublishPreviewModal({ open, preview, session, documentTitles = {}, onClose, onOpenStatus, onAnnounce }: PublishPreviewModalProps) {
  const { token } = theme.useToken();
  const [step, setStep] = useState<Step>('preview');
  const [removalConfirmed, setRemovalConfirmed] = useState(false);
  const [findings, setFindings] = useState<readonly DlpFinding[] | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<PublishPrimaryState>('Publishing');
  const [publishError, setPublishError] = useState<string | AtomicBlockErrorDetails | undefined>(undefined);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    setStep('preview');
    setRemovalConfirmed(false);
    setFindings(null);
    setOverrideConfirmed(false);
    setConflict(false);
    setScanBusy(false);
    setPublishBusy(false);
    setActionError(null);
    setPublishStatus('Publishing');
    setPublishError(undefined);
    setUncertain(false);
  }, [open, preview]);

  const closeBeforePost = () => {
    session.closePreview();
    onAnnounce?.('Đã hủy xuất bản. Không có nội dung tài liệu nào được gửi.');
    onClose();
  };

  const closeDuringPublish = () => {
    session.closePreview();
    onClose();
  };

  const scan = async () => {
    if (scanBusy || publishBusy) return;
    setScanBusy(true);
    setActionError(null);
    setOverrideConfirmed(false);
    try {
      if (preview.hasRemovals) session.confirmRemoval();
      setStep('scanning');
      const result = await session.scan();
      setFindings(result);
      setStep('review');
      onAnnounce?.(result.length ? 'Cần xác nhận cảnh báo dữ liệu nhạy cảm.' : 'Đã kiểm tra dữ liệu nhạy cảm.');
    } catch {
      setActionError('Không thể kiểm tra dữ liệu nhạy cảm. Thử lại sau.');
      setStep('preview');
    } finally {
      setScanBusy(false);
    }
  };

  const publish = async () => {
    if (publishBusy || scanBusy) return;
    setPublishBusy(true);
    setActionError(null);
    try {
      const confirmation = await session.confirmFindings(overrideConfirmed);
      const result = await session.submitConfirmedAttempt(confirmation.nonce);
      if (result.conflict) {
        setConflict(true);
        setPublishStatus('Publishing');
        setStep('publishing');
        onAnnounce?.('Bộ tài liệu này đang được xuất bản.');
        return;
      }
      setStep('publishing');
      setPublishStatus('Publishing');
      onAnnounce?.('Đã chấp nhận lần xuất bản.');

      try {
        const pollResult = await session.pollAcceptedAttempt();
        if (pollResult) {
          setPublishStatus(pollResult.status);
          setUncertain(Boolean(pollResult.uncertain));
          if (pollResult.status === 'Failed') {
            const error = pollResult.error;
            setPublishError(
              error?.code === 'OVERSIZED_ATOMIC_BLOCK'
                ? {
                    code: error.code,
                    ...(error.blockType ? { blockType: error.blockType } : {}),
                    ...(error.line ? { line: error.line } : {}),
                    ...(error.column ? { column: error.column } : {}),
                    ...(error.limit ? { limit: error.limit } : {}),
                  }
                : error?.message || 'Máy chủ gặp lỗi khi xử lý ảnh chụp.'
            );
            onAnnounce?.('Xuất bản thất bại.');
          } else if (pollResult.status === 'In sync') {
            onAnnounce?.('Đã xuất bản bộ tài liệu.');
          } else if (pollResult.uncertain) {
            onAnnounce?.('Mất kết nối — chưa xác định kết quả.');
          }
        }
      } catch {
        setUncertain(true);
        onAnnounce?.('Mất kết nối — chưa xác định kết quả.');
      }
    } catch {
      setActionError('Không thể gửi ảnh chụp xuất bản. Kiểm tra kết nối và thử lại.');
    } finally {
      setPublishBusy(false);
    }
  };

  const counters = [
    ['Thêm', preview.counts.documentsAdded, preview.counts.chunksAdded],
    ['Thay đổi', preview.counts.documentsChanged, preview.counts.chunksChanged],
    ['Gỡ khỏi máy chủ', preview.counts.documentsRemoved, preview.counts.chunksRemoved],
    ['Không đổi', preview.counts.documentsUnchanged, preview.counts.chunksUnchanged],
  ] as const;

  const footer = step === 'publishing' ? null : [
    <Button key="cancel" disabled={scanBusy || publishBusy} onClick={closeBeforePost}>Hủy xuất bản</Button>,
    ...(step === 'preview' || step === 'scanning'
      ? [<Button key="scan" type="primary" loading={scanBusy} disabled={scanBusy || (preview.hasRemovals && !removalConfirmed)} onClick={scan}>Kiểm tra dữ liệu nhạy cảm</Button>]
      : [<Button key="publish" type="primary" loading={publishBusy} danger={Boolean(findings?.length)} disabled={publishBusy || (Boolean(findings?.length) && !overrideConfirmed)} onClick={publish}>{findings?.length ? 'Vẫn xuất bản lần này' : 'Xuất bản bộ tài liệu'}</Button>]),
  ];

  return (
    <Modal open={open} width={760} title={step === 'publishing' ? 'Trạng thái xuất bản' : 'Xem trước thay đổi'} onCancel={step === 'publishing' ? closeDuringPublish : closeBeforePost} footer={footer}>
      {step === 'publishing' ? (
        <PublishProgressPanel
          status={publishStatus}
          conflict={conflict}
          uncertain={uncertain}
          {...(publishError ? { error: publishError } : {})}
          {...(onOpenStatus ? { onOpenStatus } : {})}
          onClose={closeDuringPublish}
        />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {actionError && <Alert type="error" showIcon message={actionError} />}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: token.marginSM }}>
            {counters.map(([label, documents, chunks]) => (
              <Statistic key={label} title={label} value={documents} suffix={`tài liệu · ${chunks} chunk`} />
            ))}
          </div>
          <Tabs
            items={(['added', 'changed', 'removed', 'unchanged'] as const).map((classification) => ({
              key: classification,
              label: LABELS[classification],
              children: (
                <List
                  dataSource={preview.documents.filter((document) => document.classification === classification)}
                  locale={{ emptyText: 'Không có thay đổi.' }}
                  renderItem={(document) => {
                    const chunks = preview.chunks.filter((chunk) => chunk.documentId === document.documentId);
                    return (
                      <List.Item>
                        <Space direction="vertical">
                          <Text strong>{document.title}</Text>
                          {classification === 'removed' && <Text type="warning">Tài liệu cục bộ vẫn được giữ nguyên.</Text>}
                          {chunks.map((chunk, index) => <Text key={`${chunk.classification}-${index}`} type="secondary">Chunk: {LABELS[chunk.classification]}</Text>)}
                        </Space>
                      </List.Item>
                    );
                  }}
                />
              ),
            }))}
          />
          {preview.hasRemovals && (
            <Alert
              type="warning"
              showIcon
              message="Gỡ tài liệu khỏi máy chủ"
              description={
                <Space direction="vertical">
                  <Text>Các tài liệu đã chọn sẽ bị gỡ khỏi ảnh chụp trên Knowledge Server. Tài liệu cục bộ trong PlannerMate không bị xóa.</Text>
                  <Checkbox checked={removalConfirmed} onChange={(event) => { setRemovalConfirmed(event.target.checked); if (!event.target.checked) session.cancelRemoval(); }}>
                    Tôi hiểu các tài liệu này sẽ bị gỡ khỏi ảnh chụp trên máy chủ, không bị xóa khỏi PlannerMate.
                  </Checkbox>
                </Space>
              }
            />
          )}
          {step === 'scanning' && <Space><Spin /><Text>Đang kiểm tra dữ liệu trên thiết bị…</Text></Space>}
          {step === 'review' && findings?.length === 0 && <Alert type="success" showIcon message="Không phát hiện dữ liệu nhạy cảm theo bộ quy tắc hiện tại." />}
          {step === 'review' && findings && findings.length > 0 && (
            <DlpWarningPanel findings={findings} documentTitles={documentTitles} confirmed={overrideConfirmed} onConfirmedChange={setOverrideConfirmed} />
          )}
        </Space>
      )}
    </Modal>
  );
}
