import React from 'react';
import { Tag, Tooltip } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

export interface CitationChipProps {
  docId: string;
  title: string;
  heading?: string | undefined;
  snippet?: string | undefined;
  onOpenDoc: (docId: string) => void;
}

/**
 * CitationChip renders interactive `[📄 Doc Title §Heading]` citations
 * inside AI responses per D-13.
 * Hover displays an excerpt tooltip; click dispatches `onOpenDoc(docId)` to activate QuickPreviewDrawer.
 */
export const CitationChip: React.FC<CitationChipProps> = ({
  docId,
  title,
  heading,
  snippet,
  onOpenDoc,
}) => {
  const displayLabel = heading ? `${title} §${heading}` : title;

  const chipContent = (
    <Tag
      icon={<FileTextOutlined style={{ marginRight: 4 }} />}
      color="geekblue"
      style={{
        cursor: 'pointer',
        margin: '0 4px',
        padding: '1px 8px',
        borderRadius: 12,
        fontWeight: 500,
        fontSize: 12,
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'baseline',
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenDoc(docId);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDoc(docId);
        }
      }}
    >
      {displayLabel}
    </Tag>
  );

  if (snippet?.trim()) {
    return (
      <Tooltip
        title={
          <div style={{ maxWidth: 300, maxHeight: 150, overflowY: 'auto', fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{displayLabel}</div>
            <div style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>{snippet.trim()}</div>
          </div>
        }
      >
        {chipContent}
      </Tooltip>
    );
  }

  return chipContent;
};
