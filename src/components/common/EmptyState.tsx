import React from 'react';
import { Empty } from 'antd';

export interface EmptyStateProps {
  heading?: string;
  body?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  heading = 'No items yet',
  body = 'Select a navigation tab from the sidebar to view details.',
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
