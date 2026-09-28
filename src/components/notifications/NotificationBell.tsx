import React from 'react';
import { Badge, Button, Tooltip } from 'antd';
import { BellOutlined } from '@ant-design/icons';

export interface NotificationBellProps {
  count: number;
  onClick: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ count, onClick }) => {
  return (
    <Tooltip title={`Thông báo & Nhắc nhở (${count} cảnh báo)`}>
      <Badge
        count={count}
        overflowCount={99}
        color="#ff4d4f"
        offset={[-2, 4]}
      >
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          onClick={onClick}
          aria-label={`Thông báo và nhắc nhở (${count} cảnh báo)`}
          style={{ minHeight: 36, minWidth: 36 }}
        />
      </Badge>
    </Tooltip>
  );
};
