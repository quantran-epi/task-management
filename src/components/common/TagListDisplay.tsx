import React from 'react';
import { Tag, Tooltip, Popover, theme, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import type { TagSource } from '../../domain/inheritance';

export interface TagListDisplayProps {
  tags?: string[] | undefined;
  source?: TagSource | undefined;
  originName?: string | undefined;
}

export const TagListDisplay: React.FC<TagListDisplayProps> = ({
  tags = [],
  source = 'direct',
  originName,
}) => {
  const { token } = theme.useToken();

  if (!tags || tags.length === 0) {
    return (
      <Typography.Text style={{ color: token.colorTextTertiary }}>
        —
      </Typography.Text>
    );
  }

  const isInherited = source === 'milestone' || source === 'project';
  const originTypeLabel = source === 'milestone' ? 'Milestone' : 'Dự án';
  const tooltipTitle = isInherited
    ? `Kế thừa từ ${originTypeLabel}: ${originName || ''}`
    : undefined;

  const renderTag = (tag: string, index: number) => {
    if (isInherited) {
      const tagEl = (
        <Tag
          key={index}
          style={{
            borderStyle: 'dashed',
            borderColor: token.colorBorder,
            opacity: 0.75,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            margin: '2px 4px 2px 0',
          }}
          tabIndex={0}
          role="note"
          aria-label={`${tag} (${tooltipTitle})`}
        >
          <LinkOutlined style={{ fontSize: 12, color: token.colorTextTertiary }} />
          <span>{tag}</span>
        </Tag>
      );

      return (
        <Tooltip key={index} title={tooltipTitle}>
          {tagEl}
        </Tooltip>
      );
    }

    return (
      <Tag key={index} style={{ margin: '2px 4px 2px 0' }}>
        {tag}
      </Tag>
    );
  };

  const visibleTags = tags.slice(0, 2);
  const remainingTags = tags.slice(2);

  const popoverContent = (
    <div style={{ maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Typography.Text strong style={{ fontSize: 12 }}>
        Tất cả:
      </Typography.Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {tags.map((tag, idx) => renderTag(tag, idx))}
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        maxWidth: '100%',
      }}
    >
      {visibleTags.map((tag, idx) => renderTag(tag, idx))}
      {remainingTags.length > 0 && (
        <Popover content={popoverContent} trigger={['hover', 'focus']}>
          <Tag
            style={{
              cursor: 'pointer',
              margin: '2px 0 2px 0',
              userSelect: 'none',
            }}
            tabIndex={0}
            role="button"
            aria-label={`Còn ${remainingTags.length} thẻ khác. Nhấn để xem tất cả.`}
          >
            +{remainingTags.length}
          </Tag>
        </Popover>
      )}
    </div>
  );
};
