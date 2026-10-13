import { Alert, Button, List, Modal, Space, Statistic, Tabs, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import type { ChangePreview, DeltaClassification } from '../../services/knowledge/changePreview';
import type { PublishSession } from '../../services/knowledge/publishOrchestrator';
import type { PublishPrimaryState } from '../../types/models';
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

export function PublishPreviewModal({ open, preview, session, onClose, onOpenStatus, onAnnounce }: PublishPreviewModalProps) {
  const { token } = theme.useToken();
  const [step, setStep] = useState<Step>('preview');
  const [conflict, setConflict] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<PublishPrimaryState>('Publishing');
  const [publishError, setPublishError] = useState<string | AtomicBlockErrorDetails | undefined>(undefined);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    setStep('review');
    setConflict(false);
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

  const publish = async () => {
    if (publishBusy) return;
    setPublishBusy(true);
    setActionError(null);
    try {
      if (preview.hasRemovals) session.confirmRemoval();
      await session.scan().catch(() => {});
      const confirmation = await session.confirmFindings(true);
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
    <Button key="cancel" disabled={publishBusy} onClick={closeBeforePost}>Hủy</Button>,
    <Button key="publish" type="primary" loading={publishBusy} disabled={publishBusy} onClick={publish}>Xuất bản ngay</Button>,
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
          {actionError && <Alert type="error" showIcon message={actionError} />}
        </Space>
      )}
    </Modal>
  );
}
