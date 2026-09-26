import React, { useState, useEffect } from 'react';
import { Modal, Alert, Button } from 'antd';

export const UpgradeModal: React.FC = () => {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const handleBlocked = () => setBlocked(true);
    const handleVersionChanged = () => setBlocked(true);

    window.addEventListener('db-upgrade-blocked', handleBlocked);
    window.addEventListener('db-version-changed', handleVersionChanged);

    return () => {
      window.removeEventListener('db-upgrade-blocked', handleBlocked);
      window.removeEventListener('db-version-changed', handleVersionChanged);
    };
  }, []);

  return (
    <Modal
      title="Database Upgrade Blocked"
      open={blocked}
      closable={false}
      footer={[
        <Button
          key="reload"
          type="primary"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </Button>,
      ]}
    >
      <Alert
        type="warning"
        message="Conflicting Browser Tab"
        description="Database upgrade blocked by another tab. Close competing tabs and reload to continue."
        showIcon
      />
    </Modal>
  );
};
