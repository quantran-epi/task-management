import React from 'react';
import { theme, Button, Tooltip } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import type { DiffHunk, DiffLine, DiffViewMode } from '../../types/agent';

export interface DiffHunkViewProps {
  hunk: DiffHunk;
  filePath: string;
  viewMode: DiffViewMode;
  onLineClick: (filePath: string, lineNumber: number, code: string) => void;
  onAcceptHunk?: (hunk: DiffHunk) => void;
  onAcceptLine?: (hunk: DiffHunk, lineIndex: number) => void;
}

export const DiffHunkView: React.FC<DiffHunkViewProps> = ({
  hunk,
  filePath,
  viewMode,
  onLineClick,
  onAcceptHunk,
  onAcceptLine,
}) => {
  const { token } = theme.useToken();
  const isDark = token.colorBgBase === '#141414' || token.colorTextBase?.includes('255');

  // Background colors per 15-UI-SPEC.md
  const addBg = isDark ? '#23452b' : '#e6ffed';
  const delBg = isDark ? '#4d1f24' : '#ffeef0';
  const gutterBg = isDark ? '#1f1f1f' : '#f6f8fa';

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
        {/* Hunk Header */}
        <div
          style={{
            backgroundColor: gutterBg,
            color: token.colorTextSecondary,
            padding: '2px 12px',
            fontSize: 11,
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{hunk.header}</span>
          {onAcceptHunk && (
            <Button
              size="small"
              type="link"
              icon={<CheckOutlined style={{ color: '#52c41a' }} />}
              style={{ fontSize: 11, padding: '0 4px', height: 20 }}
              onClick={(e) => {
                e.stopPropagation();
                onAcceptHunk(hunk);
              }}
            >
              Accept Hunk
            </Button>
          )}
        </div>

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
  // Group lines into pairs: left (deletion or context), right (addition or context)
  const rows: Array<{ left?: DiffLine | undefined; right?: DiffLine | undefined }> = [];
  const lines = hunk.lines;
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    if (!cur) break;

    if (cur.type === 'context') {
      rows.push({ left: cur, right: cur });
      i++;
    } else if (cur.type === 'delete' || cur.type === 'add') {
      const delLines: DiffLine[] = [];
      const addLines: DiffLine[] = [];
      while (i < lines.length && (lines[i]?.type === 'delete' || lines[i]?.type === 'add')) {
        const line = lines[i]!;
        if (line.type === 'delete') {
          delLines.push(line);
        } else {
          addLines.push(line);
        }
        i++;
      }
      const maxLen = Math.max(delLines.length, addLines.length);
      for (let j = 0; j < maxLen; j++) {
        rows.push({ left: delLines[j], right: addLines[j] });
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
      {/* Hunk Header */}
      <div
        style={{
          backgroundColor: gutterBg,
          color: token.colorTextSecondary,
          padding: '2px 12px',
          fontSize: 11,
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{hunk.header}</span>
        {onAcceptHunk && (
          <Button
            size="small"
            type="link"
            icon={<CheckOutlined style={{ color: '#52c41a' }} />}
            style={{ fontSize: 11, padding: '0 4px', height: 20 }}
            onClick={(e) => {
              e.stopPropagation();
              onAcceptHunk(hunk);
            }}
          >
            Accept Hunk
          </Button>
        )}
      </div>

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
              {row.left?.type === 'delete' && onAcceptLine && leftHunkIdx >= 0 && (
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
              {row.right?.type === 'add' && onAcceptLine && rightHunkIdx >= 0 && (
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
