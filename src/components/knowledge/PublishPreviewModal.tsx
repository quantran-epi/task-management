import { Alert, Button, Checkbox, List, Modal, Space, Spin, Statistic, Tabs, Typography, theme } from 'antd';
import { useEffect, useState } from 'react';
import type { ChangePreview, DeltaClassification } from '../../services/knowledge/changePreview';
import type { PublishSession } from '../../services/knowledge/publishOrchestrator';
import type { DlpFinding } from '../../types/dlp';
import { DlpWarningPanel } from './DlpWarningPanel';
import { PublishProgressPanel } from './PublishProgressPanel';

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

  useEffect(() => {
    setStep('preview');
    setRemovalConfirmed(false);
    setFindings(null);
    setOverrideConfirmed(false);
    setConflict(false);
  }, [open, preview]);

  const closeBeforePost = () => {
    session.closePreview();
    onAnnounce?.('Đã hủy xuất bản. Không có nội dung tài liệu nào được gửi.');
    onClose();
  };

  const scan = async () => {
    setOverrideConfirmed(false);
    if (preview.hasRemovals) session.confirmRemoval();
    setStep('scanning');
    const result = await session.scan();
    setFindings(result);
    setStep('review');
    onAnnounce?.(result.length ? 'Cần xác nhận cảnh báo dữ liệu nhạy cảm.' : 'Đã kiểm tra dữ liệu nhạy cảm.');
  };

  const publish = async () => {
    const confirmation = await session.confirmFindings();
    const result = await session.submitConfirmedAttempt(confirmation.nonce);
    setConflict(Boolean(result.conflict));
    setStep('publishing');
    onAnnounce?.('Đã chấp nhận lần xuất bản.');
  };

  const counters = [
    ['Thêm', preview.counts.documentsAdded, preview.counts.chunksAdded],
    ['Thay đổi', preview.counts.documentsChanged, preview.counts.chunksChanged],
    ['Gỡ khỏi máy chủ', preview.counts.documentsRemoved, preview.counts.chunksRemoved],
    ['Không đổi', preview.counts.documentsUnchanged, preview.counts.chunksUnchanged],
  ] as const;

  const footer = step === 'publishing' ? null : [
    <Button key="cancel" onClick={closeBeforePost}>Hủy xuất bản</Button>,
    ...(step === 'preview' || step === 'scanning'
      ? [<Button key="scan" type="primary" disabled={step === 'scanning' || (preview.hasRemovals && !removalConfirmed)} onClick={scan}>Kiểm tra dữ liệu nhạy cảm</Button>]
      : [<Button key="publish" type="primary" danger={Boolean(findings?.length)} disabled={Boolean(findings?.length) && !overrideConfirmed} onClick={publish}>{findings?.length ? 'Vẫn xuất bản lần này' : 'Xuất bản bộ tài liệu'}</Button>]),
  ];

  return (
    <Modal open={open} width={760} title={step === 'publishing' ? 'Trạng thái xuất bản' : 'Xem trước thay đổi'} onCancel={step === 'publishing' ? onClose : closeBeforePost} footer={footer}>
      {step === 'publishing' ? (
        <PublishProgressPanel
          status="Publishing"
          conflict={conflict}
          {...(onOpenStatus ? { onOpenStatus } : {})}
          onClose={onClose}
        />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
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
