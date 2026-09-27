import React from 'react';
import { Empty } from 'antd';

export interface EmptyStateProps {
  heading?: string;
  body?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  heading = 'Chưa có mục nào',
  body = 'Chọn một mục từ thanh điều hướng bên cạnh để xem chi tiết.',
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 240,
        padding: '32px 16px',
      }}
    >
      <Empty
        description={
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{heading}</div>
            <div style={{ color: '#8c8c8c' }}>{body}</div>
          </div>
        }
      />
    </div>
  );
};
