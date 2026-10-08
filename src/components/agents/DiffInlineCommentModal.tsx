import React, { useState } from 'react';
import { Modal, Input, Typography, Space, Button } from 'antd';
import { formatInlineFeedbackPrompt } from '../../utils/ghostDevPrompt';

const { Text, Paragraph } = Typography;

export interface DiffInlineCommentModalProps {
  open: boolean;
  filePath: string;
  lineNumber?: number;
  selectedCode?: string;
  onClose: () => void;
  onSubmit: (formattedPrompt: string) => Promise<void>;
}

export const DiffInlineCommentModal: React.FC<DiffInlineCommentModalProps> = ({
  open,
  filePath,
  lineNumber = 0,
  selectedCode = '',
  onClose,
  onSubmit,
}) => {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isWholeFile = !lineNumber || lineNumber <= 0;

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const prompt = formatInlineFeedbackPrompt(
        filePath,
        lineNumber,
        selectedCode,
        comment.trim()
      );
      await onSubmit(prompt);
      setComment('');
      onClose();
    } catch (err) {
      console.error('[GhostDev] Failed to submit inline feedback:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={isWholeFile ? 'Gửi đánh giá tập tin cho Agent (File Review)' : 'Thêm phản hồi mã nguồn (Inline Feedback)'}
      open={open}
      zIndex={1300}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          Hủy
        </Button>,
        <Button
          key="submit"
          type="primary"
          style={{ backgroundColor: '#4f46e5' }}
          onClick={handleSubmit}
          loading={submitting}
          disabled={!comment.trim()}
        >
          Gửi phản hồi
        </Button>,
      ]}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <div>
          <Text strong>Tập tin:</Text> <Text code>{filePath}</Text> {!isWholeFile && `(Dòng ${lineNumber})`}
        </div>

        {!isWholeFile && selectedCode && (
          <div>
            <Text type="secondary">Đoạn mã được chọn:</Text>
            <pre
              style={{
                maxHeight: 140,
                overflowY: 'auto',
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                margin: '6px 0 0 0',
                lineHeight: 1.4,
              }}
            >
              {selectedCode}
            </pre>
          </div>
        )}

        <div>
          <Paragraph style={{ marginBottom: 4 }}>
            <Text strong>Nội dung chỉ đạo chỉnh sửa:</Text>
          </Paragraph>
          <Input.TextArea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              isWholeFile
                ? "Nhập nhận xét hoặc yêu cầu sửa cho toàn bộ tập tin này..."
                : "Ví dụ: Đổi tên hàm thành calculateTotal và thêm kiểm tra giá trị null..."
            }
            aria-label="Nội dung phản hồi mã nguồn"
            autoFocus
          />
        </div>
      </Space>
    </Modal>
  );
};
