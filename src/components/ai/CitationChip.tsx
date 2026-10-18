import React from 'react';
import { Tag, Tooltip, theme } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

export interface CitationChipProps {
  docId?: string | undefined;
  title?: string | undefined;
  documentTitle?: string | undefined;
  heading?: string | undefined;
  sectionAnchor?: string | null | undefined;
  snippet?: string | undefined;
  onOpenDoc?: ((docId: string) => void) | undefined;
  onActivate?: (() => void) | undefined;

  // Plan 11 extensions
  index?: number | undefined;
  source?: 'server' | 'local' | undefined;
  evidenceClass?: 'OBSERVED' | 'INFERRED' | 'BUSINESS_APPROVED' | 'LOCAL' | undefined;
  range?: { startLine: number; endLine: number } | undefined;
  snapshotId?: string | undefined;
  publishedContentHash?: string | null | undefined;
}

/**
 * CitationChip renders interactive citations.
 * Legacy: `[📄 Doc Title §Heading]`
 * Phase 19: compact `[N]` (server) or `[LN]` (local with visible Local tag).
 * Keyboard activation (Enter/Space) and click dispatch onActivate or onOpenDoc.
 */
export const CitationChip: React.FC<CitationChipProps> = ({
  docId,
  title,
  documentTitle,
  heading,
  sectionAnchor,
  snippet,
  onOpenDoc,
  onActivate,
  index,
  source = 'server',
  evidenceClass,
  range,
  snapshotId,
  publishedContentHash,
}) => {
  const { token } = theme.useToken();
  const effectiveTitle = documentTitle ?? title ?? 'Tài liệu';
  const effectiveHeading = sectionAnchor ?? heading;

  const handleActivate = (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (onActivate) {
      onActivate();
    } else if (onOpenDoc && docId) {
      onOpenDoc(docId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      handleActivate();
    }
  };

  // If index is provided, use compact Phase 19 rendering
  if (typeof index === 'number') {
    const isLocal = source === 'local';
    const label = isLocal ? `[L${index}]` : `[${index}]`;

    const rangeStr = range ? `L${range.startLine}-${range.endLine}` : undefined;
    const snapShort = snapshotId ? snapshotId.slice(0, 7) : undefined;
    const snapLabel = isLocal ? 'Local' : snapShort ? `Snapshot ${snapShort}` : '';
    const ariaLabel = `${label} ${effectiveTitle}${rangeStr ? `, ${rangeStr}` : ''}${
      evidenceClass ? `, ${evidenceClass}` : ''
    }${snapLabel ? `, ${snapLabel}` : ''}`;

    const tagStyle: React.CSSProperties = {
      cursor: 'pointer',
      margin: '0 2px',
      padding: '0 6px',
      borderRadius: token.borderRadiusSM ?? 4,
      fontWeight: 600,
      fontSize: 12,
      lineHeight: '20px',
      height: 20,
      display: 'inline-flex',
      alignItems: 'center',
      verticalAlign: 'baseline',
      ...(isLocal
        ? {
            background: token.colorFillSecondary,
            borderColor: token.colorBorder,
            color: token.colorText,
          }
        : {
            background: token.colorBgContainer,
            borderColor: token.colorPrimary,
            color: token.colorPrimary,
          }),
    };

    const chipContent = (
      <Tag
        style={tagStyle}
        onClick={handleActivate}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
      >
        <span>{label}</span>
        {isLocal && (
          <span
            style={{
              marginLeft: 4,
              fontSize: 10,
              fontWeight: 600,
              padding: '0 3px',
              borderRadius: 3,
              background: token.colorFillTertiary,
              color: token.colorTextSecondary,
              lineHeight: '14px',
            }}
          >
            Local
          </span>
        )}
      </Tag>
    );

    const tooltipContent = (
      <div style={{ maxWidth: 280, fontSize: 12, lineHeight: 1.4 }}>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{effectiveTitle}</div>
        {effectiveHeading && (
          <div style={{ color: token.colorTextSecondary, marginBottom: 2 }}>§ {effectiveHeading}</div>
        )}
        {rangeStr && <div>Dòng: {rangeStr}</div>}
        {evidenceClass && <div>Phân loại: {evidenceClass}</div>}
        {!isLocal && snapShort && <div>Bản chụp: {snapShort}…</div>}
        {isLocal && publishedContentHash === null && (
          <div style={{ color: token.colorWarning }}>Local · chưa xuất bản</div>
        )}
        {snippet?.trim() && (
          <div style={{ marginTop: 4, whiteSpace: 'pre-wrap', opacity: 0.9 }}>{snippet.trim()}</div>
        )}
      </div>
    );

    return <Tooltip title={tooltipContent}>{chipContent}</Tooltip>;
  }

  // Legacy rendering fallback
  const displayLabel = effectiveHeading ? `${effectiveTitle} §${effectiveHeading}` : effectiveTitle;

  const chipContent = (
    <Tag
      icon={<FileTextOutlined style={{ marginRight: 4, flexShrink: 0 }} />}
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
        maxWidth: 200,
      }}
      onClick={handleActivate}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {displayLabel}
      </span>
    </Tag>
  );

  if (snippet?.trim()) {
    return (
      <Tooltip
        title={
          <div style={{ maxWidth: 300, maxHeight: 150, overflowY: 'auto', fontSize: 12, wordBreak: 'break-word' }}>
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
