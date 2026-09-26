import React from 'react';
import { Tag } from 'antd';

export interface HierarchyBreadcrumbProps {
  projectId?: string;
  projectName?: string;
  milestoneName?: string;
  onSelectProject?: (projectId: string) => void;
}

export const HierarchyBreadcrumb: React.FC<HierarchyBreadcrumbProps> = ({
  projectId,
  projectName,
  milestoneName,
  onSelectProject,
}) => {
  if (!projectId) {
    return (
      <Tag
        bordered={false}
        style={{
          margin: 0,
          fontSize: 12,
          color: '#8c8c8c',
          background: 'rgba(0, 0, 0, 0.04)',
        }}
      >
        Standalone
      </Tag>
    );
  }

  const isClickable = Boolean(onSelectProject);
  const label = milestoneName
    ? `${projectName || 'Project'} > ${milestoneName}`
    : projectName || 'Project';

  const handleClick = (e: React.MouseEvent) => {
    if (isClickable) {
      e.stopPropagation();
      onSelectProject?.(projectId);
    }
  };

  return (
    <Tag
      bordered
      onClick={handleClick}
      style={{
        margin: 0,
        fontSize: 12,
        cursor: isClickable ? 'pointer' : 'default',
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
      title={label}
    >
      {label}
    </Tag>
  );
};
