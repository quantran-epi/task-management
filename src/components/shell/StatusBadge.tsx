import React from 'react';
import { Badge, Tooltip } from 'antd';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export const StatusBadge: React.FC = () => {
  const isOnline = useNetworkStatus();

  return (
    <Tooltip title={isOnline ? 'Online (IndexedDB connected)' : 'Offline (Local storage active)'}>
      <Badge
        status={isOnline ? 'success' : 'warning'}
        text={isOnline ? 'Online' : 'Offline'}
        style={{ cursor: 'pointer' }}
      />
    </Tooltip>
  );
};
