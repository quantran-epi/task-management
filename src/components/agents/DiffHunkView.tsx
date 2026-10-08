import React, { useState } from 'react';
import { theme, Button, Space, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { DiffHunk, DiffLine, DiffViewMode } from '../../types/agent';

export interface DiffHunkViewProps {
  hunk: DiffHunk;
  filePath: string;
  viewMode: DiffViewMode;
  onLineClick: (filePath: string, lineNumber: number, code: string) => void;
  onAcceptHunk?: (filePath: string, hunk: DiffHunk) => Promise<void> | void;
  onRejectHunk?: (filePath: string, hunk: DiffHunk) => Promise<void> | void;
  onAcceptLine?: (hunk: DiffHunk, lineIndex: number) => void;
}

export const DiffHunkView: React.FC<DiffHunkViewProps> = ({
  hunk,
  filePath,
  viewMode,
  onLineClick,
  onAcceptHunk,
  onRejectHunk,
  onAcceptLine,
}) => {
  const { token } = theme.useToken();
  const isDark = token.colorBgBase === '#141414' || token.colorTextBase?.includes('255');
  const [acting, setActing] = useState(false);

  // Background colors per 15-UI-SPEC.md
  const addBg = isDark ? '#23452b' : '#e6ffed';
  const delBg = isDark ? '#4d1f24' : '#ffeef0';
  const gutterBg = isDark ? '#1f1f1f' : '#f6f8fa';

  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAcceptHunk) return;
    setActing(true);
    try {
      await onAcceptHunk(filePath, hunk);
    } finally {
      setActing(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRejectHunk) return;
    setActing(true);
    try {
      await onRejectHunk(filePath, hunk);
    } finally {
      setActing(false);
    }
  };

  const renderHunkHeader = () => (
    <div
      style={{
        backgroundColor: gutterBg,
        color: token.colorTextSecondary,
        padding: '3px 12px',
        fontSize: 11,
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{hunk.header}</span>
      {(onAcceptHunk || onRejectHunk) && (
        <Space size={6}>
          {onAcceptHunk && (
            <Tooltip title="Chấp nhận thay đổi ở đoạn này (Accept Hunk)">
              <Button
                size="small"
                type="text"
                icon={<CheckOutlined style={{ color: '#52c41a' }} />}
                loading={acting}
                disabled={acting}
                onClick={handleAccept}
                style={{ fontSize: 11, height: 22, padding: '0 6px' }}
              >
                Accept
              </Button>
            </Tooltip>
          )}
          {onRejectHunk && (
            <Tooltip title="Hủy bỏ/Hoàn tác đoạn thay đổi này (Reject Hunk)">
              <Button
                size="small"
                type="text"
                danger
                icon={<CloseOutlined />}
                loading={acting}
                disabled={acting}
                onClick={handleReject}
                style={{ fontSize: 11, height: 22, padding: '0 6px' }}
              >
                Reject
              </Button>
            </Tooltip>
          )}
        </Space>
      )}
    </div>
  );

  if (viewMode === 'unified') {
    return (
      <div
        style={{
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 12,
          lineHeight: '22px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {renderHunkHeader()}

        {/* Lines */}
        {hunk.lines.map((line, idx) => {
          const isAdd = line.type === 'add';
          const isDel = line.type === 'delete';
          const lineNum = line.newLineNumber ?? line.oldLineNumber ?? 0;
          const bg = isAdd ? addBg : isDel ? delBg : 'transparent';

          return (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              aria-label={`Dòng ${lineNum}: ${line.content}. Bấm để thêm nhận xét.`}
              onClick={() => onLineClick(filePath, lineNum, line.content)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onLineClick(filePath, lineNum, line.content);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: bg,
                cursor: 'pointer',
                transition: 'background-color 0.1s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(0.95)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none';
              }}
            >
              {/* Old Line # */}
              <div
                style={{
                  width: 44,
                  textAlign: 'right',
                  paddingRight: 8,
                  userSelect: 'none',
                  color: token.colorTextQuaternary,
                  backgroundColor: gutterBg,
                  flexShrink: 0,
                }}
              >
                {line.oldLineNumber ?? ''}
              </div>

              {/* New Line # */}
              <div
                style={{
                  width: 44,
                  textAlign: 'right',
                  paddingRight: 8,
                  userSelect: 'none',
                  color: token.colorTextQuaternary,
                  backgroundColor: gutterBg,
                  flexShrink: 0,
                }}
              >
                {line.newLineNumber ?? ''}
              </div>

              {/* Prefix Marker (+, -, ' ') */}
              <div
                style={{
                  width: 20,
                  textAlign: 'center',
                  userSelect: 'none',
                  fontWeight: 600,
                  color: isAdd ? '#52c41a' : isDel ? '#ff4d4f' : token.colorTextQuaternary,
                  flexShrink: 0,
                }}
              >
                {isAdd ? '+' : isDel ? '-' : ' '}
              </div>

              {/* Content */}
              <div
                style={{
                  flex: 1,
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  paddingRight: 8,
                  color: token.colorText,
                }}
              >
                {line.content || ' '}
              </div>

              {/* Accept Line action */}
              {(isAdd || isDel) && onAcceptLine && (
                <Tooltip title="Accept dòng này" placement="left">
                  <Button
                    size="small"
                    type="text"
                    icon={<CheckOutlined style={{ color: '#52c41a', fontSize: 11 }} />}
                    style={{ height: 20, width: 20, padding: 0, marginRight: 6, flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcceptLine(hunk, idx);
                    }}
                  />
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Split (side-by-side) view mode
  const rows: Array<{ left?: DiffLine | undefined; right?: DiffLine | undefined }> = [];
  const lines = hunk.lines;
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    if (!cur) break;

    if (cur.type === 'context') {
      rows.push({ left: cur, right: cur });
      i++;
    } else {
      const delLines: DiffLine[] = [];
      const addLines: DiffLine[] = [];

      while (i < lines.length && (lines[i]?.type === 'delete' || lines[i]?.type === 'add')) {
        const item = lines[i]!;
        if (item.type === 'delete') delLines.push(item);
        if (item.type === 'add') addLines.push(item);
        i++;
      }

      const maxLen = Math.max(delLines.length, addLines.length);
      for (let k = 0; k < maxLen; k++) {
        rows.push({
          left: delLines[k],
          right: addLines[k],
        });
      }
    }
  }

  return (
    <div
      style={{
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        lineHeight: '22px',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      {renderHunkHeader()}

      {rows.map((row, idx) => {
        const leftHunkIdx = row.left ? hunk.lines.indexOf(row.left) : -1;
        const rightHunkIdx = row.right ? hunk.lines.indexOf(row.right) : -1;

        return (
          <div key={idx} style={{ display: 'flex', width: '100%' }}>
            {/* Left Column (Deletions / Old) */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: row.left ? (row.left.type === 'delete' ? delBg : 'transparent') : gutterBg,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                overflow: 'hidden',
                cursor: row.left ? 'pointer' : 'default',
              }}
              role={row.left ? 'button' : undefined}
              tabIndex={row.left ? 0 : undefined}
              onClick={() => {
                if (row.left && row.left.oldLineNumber) {
                  onLineClick(filePath, row.left.oldLineNumber, row.left.content);
                }
              }}
            >
              <div
                style={{
                  width: 44,
                  textAlign: 'right',
                  paddingRight: 8,
                  userSelect: 'none',
                  color: token.colorTextQuaternary,
                  backgroundColor: gutterBg,
                  flexShrink: 0,
                }}
              >
                {row.left?.oldLineNumber ?? ''}
              </div>
              <div
                style={{
                  flex: 1,
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  paddingLeft: 6,
                  paddingRight: 6,
                  color: token.colorText,
                }}
              >
                {row.left?.content ?? ''}
              </div>
              {row.left?.type === 'delete' && onAcceptLine && leftHunkIdx !== -1 && (
                <Tooltip title="Accept dòng này" placement="left">
                  <Button
                    size="small"
                    type="text"
                    icon={<CheckOutlined style={{ color: '#52c41a', fontSize: 11 }} />}
                    style={{ height: 20, width: 20, padding: 0, marginRight: 4, flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcceptLine(hunk, leftHunkIdx);
                    }}
                  />
                </Tooltip>
              )}
            </div>

            {/* Right Column (Additions / New) */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: row.right ? (row.right.type === 'add' ? addBg : 'transparent') : gutterBg,
                overflow: 'hidden',
                cursor: row.right ? 'pointer' : 'default',
              }}
              role={row.right ? 'button' : undefined}
              tabIndex={row.right ? 0 : undefined}
              onClick={() => {
                if (row.right && row.right.newLineNumber) {
                  onLineClick(filePath, row.right.newLineNumber, row.right.content);
                }
              }}
            >
              <div
                style={{
                  width: 44,
                  textAlign: 'right',
                  paddingRight: 8,
                  userSelect: 'none',
                  color: token.colorTextQuaternary,
                  backgroundColor: gutterBg,
                  flexShrink: 0,
                }}
              >
                {row.right?.newLineNumber ?? ''}
              </div>
              <div
                style={{
                  flex: 1,
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  paddingLeft: 6,
                  paddingRight: 6,
                  color: token.colorText,
                }}
              >
                {row.right?.content ?? ''}
              </div>
              {row.right?.type === 'add' && onAcceptLine && rightHunkIdx !== -1 && (
                <Tooltip title="Accept dòng này" placement="left">
                  <Button
                    size="small"
                    type="text"
                    icon={<CheckOutlined style={{ color: '#52c41a', fontSize: 11 }} />}
                    style={{ height: 20, width: 20, padding: 0, marginRight: 4, flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcceptLine(hunk, rightHunkIdx);
                    }}
                  />
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
