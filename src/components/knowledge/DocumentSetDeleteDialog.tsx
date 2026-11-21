import React, { useState } from 'react';
import { Alert, Button, Input, Modal, Space, Typography, useMessage } from '../ui';
import type { TaskPlannerDatabase } from '../../db';
import { deleteDocumentSet } from '../../db/repositories/documentSetRepo';
import type { DocumentSet } from '../../types/models';
import type { KnowledgeClient } from '../../services/knowledge/knowledgeClient';

const { Paragraph } = Typography;

export interface DocumentSetDeleteDialogProps {
  open: boolean;
  set: DocumentSet;
  database: TaskPlannerDatabase;
  client?: KnowledgeClient;
  published: boolean;
  onClose: () => void;
  /** Called after a successful local delete so the host can clear its selection. */
  onDeleted?: (setId: string) => void;
}

/**
 * Shared published-set delete gate (D-01/D-02). Mounted by the Docs `doc_set` detail.
 * Full delete remains the primary action; local-only requires the exact set name.
 */
export const DocumentSetDeleteDialog: React.FC<DocumentSetDeleteDialogProps> = ({
  open,
  set,
  database,
  client,
  published,
  onClose,
  onDeleted,
}) => {
  const message = useMessage();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const localOnlyEnabled = confirmation === set.name;

  const finish = () => {
    onClose();
    setConfirmation('');
    onDeleted?.(set.id);
  };

  const executeDeleteLocalOnly = async () => {
    setIsDeleting(true);
    try {
      await deleteDocumentSet(set.id, database);
      message.success(`Đã xóa bộ tài liệu "${set.name}" khỏi cơ sở dữ liệu cục bộ.`);
      finish();
    } catch (err: any) {
      message.error(err?.message || 'Không thể xóa bộ tài liệu cục bộ.');
    } finally {
      setIsDeleting(false);
    }
  };

  const executeDeleteFull = async () => {
    setIsDeleting(true);
    try {
      if (!client) throw new Error('Knowledge Server chưa được cấu hình hoặc không khả dụng.');
      await client.purgeDocumentSet(set.id);
      await deleteDocumentSet(set.id, database);
      message.success(`Đã xóa hoàn toàn bộ tài liệu "${set.name}" (cục bộ & remote).`);
      finish();
    } catch (err: any) {
      message.error(`Xóa thất bại trên máy chủ: ${err?.message || 'Lỗi không xác định'}. Metadata cục bộ được giữ nguyên.`);
    } finally {
      setIsDeleting(false);
    }
  };

  const close = () => {
    if (isDeleting) return;
    onClose();
    setConfirmation('');
  };

  return (
    <Modal
      open={open}
      title={`Xác nhận xóa bộ tài liệu: "${set.name}"`}
      onCancel={close}
      footer={null}
    >
      {!published ? (
        <Space direction="vertical" orientation="vertical" style={{ width: '100%' }}>
          <Paragraph>
            Bộ tài liệu này chưa từng xuất bản lên máy chủ Knowledge Server. Bạn có chắc chắn muốn xóa bản ghi này khỏi cơ sở dữ liệu cục bộ không?
          </Paragraph>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button disabled={isDeleting} onClick={close}>Hủy</Button>
            <Button type="primary" danger loading={isDeleting} onClick={() => void executeDeleteLocalOnly()}>
              Xóa cục bộ
            </Button>
          </div>
        </Space>
      ) : (
        <Space direction="vertical" orientation="vertical" style={{ width: '100%' }}>
          <Paragraph>
            Bộ tài liệu này đã được xuất bản hoặc có liên kết đồ thị tri thức trên Knowledge Server. Xóa toàn bộ là hành động mặc định để tránh snapshot/graph mồ côi.
          </Paragraph>
          <Alert
            type="warning"
            showIcon
            message="Lưu ý quan trọng"
            description='Nếu chọn "Chỉ xóa cục bộ", dữ liệu snapshot/graph trên Knowledge Server sẽ không được dọn dẹp và có thể trở thành dữ liệu mồ côi.'
          />
          <Input
            aria-label={`Gõ đúng tên bộ tài liệu "${set.name}" để xóa cục bộ`}
            placeholder={`Gõ "${set.name}" để mở khóa xóa cục bộ`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={isDeleting}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <Button
              type="primary"
              danger
              loading={isDeleting}
              disabled={!client}
              onClick={() => void executeDeleteFull()}
            >
              Xóa toàn bộ (Cục bộ & Remote)
            </Button>
            <Button
              danger
              disabled={isDeleting || !localOnlyEnabled}
              onClick={() => void executeDeleteLocalOnly()}
            >
              Chỉ xóa cục bộ (Giữ remote)
            </Button>
            <Button disabled={isDeleting} onClick={close}>Hủy</Button>
          </div>
        </Space>
      )}
    </Modal>
  );
};
