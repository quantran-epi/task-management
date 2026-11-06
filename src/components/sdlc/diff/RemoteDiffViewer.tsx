import React, { useState } from 'react';
import { theme, Segmented, Button, Alert, Modal, Tag } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import { parseGitDiff } from '../../../utils/gitDiffParser';
import type { DiffViewMode, DiffHunk, DiffLine } from '../../../types/agent';

export interface RemoteDiffViewerProps {
  rawDiff: string;
  filePath: string;
  viewMode?: DiffViewMode;
  onViewModeChange?: (mode: DiffViewMode) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const LINE_SAFETY_CAP = 5000;

export const RemoteDiffViewer: React.FC<RemoteDiffViewerProps> = ({
  rawDiff,
  filePath,
  viewMode: controlledViewMode,
  onViewModeChange,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const { token } = theme.useToken();
  const isDark = token.colorBgBase === '#141414' || token.colorTextBase?.includes('255');

  const [internalViewMode, setInternalViewMode] = useState<DiffViewMode>('unified');
  const [loadFullDiffConfirmed, setLoadFullDiffConfirmed] = useState(false);

  const viewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = (mode: DiffViewMode) => {
    setInternalViewMode(mode);
    onViewModeChange?.(mode);
  };

  const addBg = isDark ? '#23452b' : '#e6ffed';
  const delBg = isDark ? '#4d1f24' : '#ffeef0';
  const gutterBg = isDark ? '#1f1f1f' : '#f6f8fa';

  const allLines = rawDiff ? rawDiff.split('\n') : [];
  const isOverCapped = allLines.length > LINE_SAFETY_CAP;
  const effectiveDiff =
    isOverCapped && !loadFullDiffConfirmed
      ? allLines.slice(0, LINE_SAFETY_CAP).join('\n')
      : rawDiff;

  const parsedFiles = parseGitDiff(effectiveDiff);
  const targetFile =
    parsedFiles.find((f) => f.newPath === filePath || f.oldPath === filePath) ||
    parsedFiles[0];

  const totalAdditions = targetFile?.additions ?? 0;
  const totalDeletions = targetFile?.deletions ?? 0;

  const renderUnifiedHunk = (hunk: DiffHunk, hunkIdx: number) => (
    <div key={hunkIdx} style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      <div
        style={{
          backgroundColor: gutterBg,
          color: token.colorTextSecondary,
          padding: '4px 12px',
          fontSize: 12,
          fontFamily: 'monospace',
          fontWeight: 600,
          userSelect: 'none',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        {hunk.header || `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`}
      </div>
      {hunk.lines.map((line, lineIdx) => {
        const isAdd = line.type === 'add';
        const isDel = line.type === 'delete';
        const bg = isAdd ? addBg : isDel ? delBg : 'transparent';

        return (
          <div
            key={lineIdx}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: bg,
              fontSize: 12,
              lineHeight: '20px',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
                fontSize: 12,
              }}
            >
              {line.oldLineNumber ?? ''}
            </div>
            <div
              style={{
                width: 44,
                textAlign: 'right',
                paddingRight: 8,
                userSelect: 'none',
                color: token.colorTextQuaternary,
                backgroundColor: gutterBg,
                flexShrink: 0,
                fontSize: 12,
              }}
            >
              {line.newLineNumber ?? ''}
            </div>
            <div
              style={{
                width: 24,
                textAlign: 'center',
                userSelect: 'none',
                fontWeight: 600,
                color: isAdd ? '#52c41a' : isDel ? '#ff4d4f' : token.colorTextQuaternary,
                flexShrink: 0,
                fontSize: 12,
              }}
            >
              {isAdd ? '+' : isDel ? '-' : ' '}
            </div>
            <div
              style={{
                flex: 1,
                whiteSpace: 'pre',
                overflowX: 'auto',
                paddingRight: 8,
                color: token.colorText,
                fontSize: 12,
              }}
            >
              {line.content || ' '}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderSplitHunk = (hunk: DiffHunk, hunkIdx: number) => {
    const rows: Array<{ left?: DiffLine; right?: DiffLine }> = [];
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
      <div key={hunkIdx} style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <div
          style={{
            backgroundColor: gutterBg,
            color: token.colorTextSecondary,
            padding: '4px 12px',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 600,
            userSelect: 'none',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {hunk.header || `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`}
        </div>

        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            style={{
              display: 'flex',
              width: '100%',
              fontSize: 12,
              lineHeight: '20px',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }}
          >
            {/* Left Column (Deletions / Base) */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: row.left ? (row.left.type === 'delete' ? delBg : 'transparent') : gutterBg,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                overflow: 'hidden',
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
                  fontSize: 12,
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
                  fontSize: 12,
                }}
              >
                {row.left?.content ?? ''}
              </div>
            </div>

            {/* Right Column (Additions / Target) */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                backgroundColor: row.right ? (row.right.type === 'add' ? addBg : 'transparent') : gutterBg,
                overflow: 'hidden',
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
                  fontSize: 12,
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
                  fontSize: 12,
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

  const renderContent = (inModal = false) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: token.colorBgContainer,
        borderRadius: inModal ? 0 : 8,
        overflow: 'hidden',
      }}
    >
      {/* Toolbar Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          backgroundColor: token.colorFillAlter,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={filePath}
          >
            {filePath || '(Không có tệp nào được chọn)'}
          </span>
          {(totalAdditions > 0 || totalDeletions > 0) && (
            <span style={{ fontSize: 12, color: token.colorTextSecondary }}>
              <span style={{ color: '#52c41a', fontWeight: 600 }}>+{totalAdditions}</span>
              {' · '}
              <span style={{ color: '#ff4d4f', fontWeight: 600 }}>−{totalDeletions}</span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Segmented
            size="small"
            value={viewMode}
            onChange={(val) => setViewMode(val as DiffViewMode)}
            options={[
              { label: 'Unified', value: 'unified' },
              { label: 'Split', value: 'split' },
            ]}
          />
          {onToggleFullscreen && (
            <Button
              size="small"
              type="text"
              icon={inModal ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={onToggleFullscreen}
              aria-label={inModal ? 'Thu nhỏ' : 'Toàn màn hình'}
            >
              {inModal ? 'Thu nhỏ' : 'Toàn màn hình'}
            </Button>
          )}
        </div>
      </div>

      {/* Safety Alert Banner */}
      {isOverCapped && !loadFullDiffConfirmed && (
        <Alert
          type="warning"
          showIcon
          style={{ margin: 8, flexShrink: 0 }}
          message={`Tệp này có ${allLines.length} dòng thay đổi. Đã tự động giới hạn hiển thị 5.000 dòng để đảm bảo hiệu năng giao diện.`}
          action={
            <Button
              size="small"
              type="primary"
              onClick={() => setLoadFullDiffConfirmed(true)}
            >
              {`Tải toàn bộ nội dung diff (${allLines.length} dòng)`}
            </Button>
          }
        />
      )}

      {/* Diff Body */}
      <div
        data-testid="remote-diff-body"
        style={{
          flex: 1,
          overflow: 'auto',
          maxHeight: inModal ? undefined : 520,
        }}
      >
        {!rawDiff || !targetFile || targetFile.hunks.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: token.colorTextTertiary,
              fontSize: 14,
            }}
          >
            {rawDiff ? 'Không có thay đổi trong tệp này.' : 'Chưa có nội dung diff để hiển thị.'}
          </div>
        ) : (
          targetFile.hunks.map((hunk, idx) =>
            viewMode === 'unified' ? renderUnifiedHunk(hunk, idx) : renderSplitHunk(hunk, idx)
          )
        )}
      </div>
    </div>
  );

  return (
    <>
      {renderContent(false)}

      {isFullscreen && (
        <Modal
          open={isFullscreen}
          onCancel={onToggleFullscreen}
          footer={null}
          width="95vw"
          centered
          styles={{
            body: { height: '85vh', padding: 0, overflow: 'hidden' },
          }}
          destroyOnClose
        >
          {renderContent(true)}
        </Modal>
      )}
    </>
  );
};
