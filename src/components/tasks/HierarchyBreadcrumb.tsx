import React from 'react';
import { Tag } from 'antd';

export interface HierarchyBreadcrumbProps {
  crCode?: string | undefined;
  crName?: string | undefined;
  systemCode?: string | undefined;
  systemName?: string | undefined;
  onSelectCr?: ((crId: string) => void) | undefined;
  crId?: string | undefined;
}

/**
 * D-46/D-47: the only hierarchy above a task is `CR > Subsystem`.
 * No project or milestone tier exists any more.
 */
export const HierarchyBreadcrumb: React.FC<HierarchyBreadcrumbProps> = ({
  crCode,
  crName,
  systemCode,
  systemName,
  onSelectCr,
  crId,
}) => {
  if (!crCode && !crName) {
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
        Chưa gắn CR
      </Tag>
    );
  }

  const crLabel = crCode || crName || 'CR';
  const isClickable = Boolean(onSelectCr && crId);
  const label = systemCode ? `${crLabel} > ${systemCode}` : crLabel;

  const handleClick = (e: React.MouseEvent) => {
    if (isClickable && crId) {
      e.stopPropagation();
      onSelectCr?.(crId);
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
      title={systemName ? `${crName ?? crLabel} > ${systemName}` : crName ?? crLabel}
    >
      {label}
    </Tag>
  );
};
