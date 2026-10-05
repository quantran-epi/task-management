import React from 'react';
import { theme } from 'antd';
import type { DiffHunk, DiffLine, DiffViewMode } from '../../types/agent';

export interface DiffHunkViewProps {
  hunk: DiffHunk;
  filePath: string;
  viewMode: DiffViewMode;
  onLineClick: (filePath: string, lineNumber: number, code: string) => void;
}

export const DiffHunkView: React.FC<DiffHunkViewProps> = ({
  hunk,
  filePath,
  viewMode,
  onLineClick,
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
          }}
        >
          {hunk.header}
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
                  paddingRight: 12,
                  color: token.colorText,
                }}
              >
                {line.content || ' '}
              </div>
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
    } else if (cur.type === 'delete') {
      // Check if immediately followed by an addition
      const next = lines[i + 1];
      if (next && next.type === 'add') {
        rows.push({ left: cur, right: next });
        i += 2;
      } else {
        rows.push({ left: cur, right: undefined });
        i++;
      }
    } else if (cur.type === 'add') {
      rows.push({ left: undefined, right: cur });
      i++;
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
        }}
      >
        {hunk.header}
      </div>

      {rows.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', width: '100%' }}>
          {/* Left Column (Deletions / Old) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
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
          </div>

          {/* Right Column (Additions / New) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
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
          </div>
        </div>
      ))}
    </div>
  );
};
