import React from 'react';
import { Empty } from 'antd';

export interface RemoteGitExplorerProps {
  db?: any;
}

export function RemoteGitExplorer(_props: RemoteGitExplorerProps) {
  return (
    <div
      data-testid="remote-git-explorer"
      style={{
        padding: 12,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Select an SSH host and repository to browse"
      />
    </div>
  );
}
