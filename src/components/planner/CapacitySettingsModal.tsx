import React, { useEffect, useRef } from 'react';
import { Modal, Space, Button } from 'antd';
import { WeeklyCapacityForm } from '../settings/WeeklyCapacityForm';
import { OverridesTable } from '../settings/OverridesTable';
import { createFocusRestorer } from '../../utils/focus';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';

export interface CapacitySettingsModalProps {
  open: boolean;
  onCancel: () => void;
  db?: TaskPlannerDatabase;
}

export const CapacitySettingsModal: React.FC<CapacitySettingsModalProps> = ({
  open,
  onCancel,
  db = defaultDb,
}) => {
  const restorerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      restorerRef.current = createFocusRestorer();
    }
  }, [open]);

  const handleClose = () => {
    onCancel();
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  return (
    <Modal
      title="Work Capacity & Overrides"
      open={open}
      onCancel={handleClose}
      footer={[
        <Button key="close" type="primary" onClick={handleClose}>
          Done
        </Button>,
      ]}
      width={720}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size="middle">
        <WeeklyCapacityForm db={db} />
        <OverridesTable db={db} />
      </Space>
    </Modal>
  );
};
