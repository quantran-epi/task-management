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
      title="Nâng cấp cơ sở dữ liệu bị chặn"
      open={blocked}
      closable={false}
      footer={[
        <Button
          key="reload"
          type="primary"
          onClick={() => window.location.reload()}
        >
          Tải lại trang
        </Button>,
      ]}
    >
      <Alert
        type="warning"
        message="Xung đột tab trình duyệt"
        description="Nâng cấp cơ sở dữ liệu bị chặn bởi một tab khác. Vui lòng đóng các tab khác và tải lại trang."
        showIcon
      />
    </Modal>
  );
};
