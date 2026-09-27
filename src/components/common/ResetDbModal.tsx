import React, { useState } from 'react';
import { Modal, Input, Typography, Alert } from 'antd';
import { resetDatabaseToDefaults } from '../../db/seeds';

const { Text } = Typography;

export interface ResetDbModalProps {
  open: boolean;
  onClose: () => void;
}

export const ResetDbModal: React.FC<ResetDbModalProps> = ({ open, onClose }) => {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (confirmText !== 'RESET') return;
    setLoading(true);
    try {
      await resetDatabaseToDefaults();
      setConfirmText('');
      onClose();
    } catch (err) {
      console.error('Failed to reset database:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Đặt lại cơ sở dữ liệu"
      open={open}
      onCancel={() => {
        setConfirmText('');
        onClose();
      }}
      onOk={handleReset}
      okText="Xác nhận đặt lại"
      cancelText="Hủy"
      okButtonProps={{ danger: true, disabled: confirmText !== 'RESET', loading }}
    >
      <Alert
        type="error"
        message="Hành động nguy hiểm"
        description="Nhập RESET để xác nhận xóa toàn bộ cơ sở dữ liệu. Hành động này không thể hoàn tác."
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Text strong>Nhập &quot;RESET&quot; bên dưới:</Text>
      <Input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="RESET"
        style={{ marginTop: 8 }}
      />
    </Modal>
  );
};
