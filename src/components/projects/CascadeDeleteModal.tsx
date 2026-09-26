import React, { useRef, useEffect } from 'react';
import { Modal, Button, Typography, Space, theme } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { createFocusRestorer } from '../../utils/focus';

const { Paragraph } = Typography;

export interface CascadeDeleteModalProps {
  open: boolean;
  targetType: 'project' | 'milestone';
  targetName: string;
  childMilestoneCount?: number;
  childTaskCount?: number;
  onClose: () => void;
  onConfirm: (mode: 'cascade' | 'orphan') => Promise<void> | void;
  loading?: boolean;
}

export const CascadeDeleteModal: React.FC<CascadeDeleteModalProps> = ({
  open,
  targetType,
  targetName,
  childMilestoneCount = 0,
  childTaskCount = 0,
  onClose,
  onConfirm,
  loading = false,
}) => {
  const { token } = theme.useToken();
  const restorerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      restorerRef.current = createFocusRestorer();
    }
  }, [open]);

  const handleClose = () => {
    onClose();
    if (restorerRef.current) {
      restorerRef.current();
    }
  };

  const isProject = targetType === 'project';

  return (
    <Modal
      title={
        <Space orientation="horizontal" size="middle" style={{ alignItems: 'center' }}>
          <ExclamationCircleFilled style={{ color: token.colorWarning, fontSize: 22 }} />
          <span>
            {isProject
              ? `Delete Project '${targetName}'`
              : `Delete Milestone '${targetName}'`}
          </span>
        </Space>
      }
      open={open}
      onCancel={handleClose}
      footer={null}
      destroyOnClose
    >
      <div style={{ marginTop: 16 }}>
        <Paragraph>
          {isProject
            ? `This project contains ${childMilestoneCount} milestone(s) and ${childTaskCount} task(s). Choose how you want to handle child records:`
            : `This milestone contains ${childTaskCount} task(s). Choose how you want to handle child tasks:`}
        </Paragraph>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginTop: 24,
          }}
        >
          {/* Default button preserves tasks per UI-SPEC & T-02-08 */}
          <Button
            type="primary"
            onClick={async () => {
              await onConfirm('orphan');
              handleClose();
            }}
            loading={loading}
            style={{ width: '100%', height: 40 }}
          >
            {isProject
              ? 'Keep Tasks (Move to Standalone)'
              : 'Keep Tasks (Move to Project Level)'}
          </Button>

          <Button
            danger
            onClick={async () => {
              await onConfirm('cascade');
              handleClose();
            }}
            loading={loading}
            style={{ width: '100%', height: 40 }}
          >
            {isProject ? 'Delete All' : 'Delete All Child Tasks'}
          </Button>

          <Button
            type="text"
            onClick={handleClose}
            disabled={loading}
            style={{ width: '100%', color: token.colorTextSecondary }}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};
