import React from 'react';
import { Badge, Tooltip } from 'antd';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export const StatusBadge: React.FC = () => {
  const isOnline = useNetworkStatus();

  return (
    <Tooltip title={isOnline ? 'Trực tuyến (kết nối IndexedDB)' : 'Ngoại tuyến (dữ liệu lưu cục bộ)'}>
      <Badge
        status={isOnline ? 'success' : 'warning'}
        text={isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
        style={{ cursor: 'pointer' }}
      />
    </Tooltip>
  );
};
