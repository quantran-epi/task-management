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
      title="Reset Database"
      open={open}
      onCancel={() => {
        setConfirmText('');
        onClose();
      }}
      onOk={handleReset}
      okText="Confirm Reset"
      okButtonProps={{ danger: true, disabled: confirmText !== 'RESET', loading }}
    >
      <Alert
        type="error"
        message="Destructive Action"
        description="Type RESET to confirm complete database purge. This action cannot be undone."
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Text strong>Type &quot;RESET&quot; below:</Text>
      <Input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="RESET"
        style={{ marginTop: 8 }}
      />
    </Modal>
  );
};
