import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Alert, Button, InputSearch, Spin } from '../../components/ui';
import { CopyOutlined } from '../../components/ui/icon';
import { DiffLineCodeRenderer } from '../../components/common/DiffSyntaxHighlighter';
import { LineNumberedPane } from '../toolwindows/LineNumberedPane';
import {
  executeOracleDescribe,
  redactOracleText,
  DEFAULT_ORACLE_CONFIG,
} from '../../services/ai/oracleSqlclService';
import { cancelToolCall } from '../../services/sshService';

const LINE_HEIGHT = 20;
const MAX_LINES = 5000;
const MAX_CHARS = 200_000;

export interface OracleObjectViewerProps {
  connectionId?: string;
  schema?: string;
  objectType?: string;
  objectName?: string;
  mode?: 'source' | 'ddl' | 'columns';
}

/** Lightweight formatting only — no formatter dependency. */
function formatSql(text: string): string {
  return text
    .replace(/;\s*/g, ';\n')
    .replace(/(CREATE\s+(?:OR\s+REPLACE\s+)?)/gi, '\n$1')
    .replace(/\b(BEGIN|END|EXCEPTION)\b/gi, '\n$1');
}

/** Column metadata rows rendered as a compact plain-text table. */
function columnsToText(columns: unknown): string {
  if (!Array.isArray(columns) || columns.length === 0) return '(không có cột)';
  const rows = columns.map((row) =>
    row && typeof row === 'object'
      ? Object.values(row as Record<string, unknown>).map((v) => String(v ?? ''))
      : [String(row)]
  );
  const widths = rows[0]!.map((_, idx) => Math.max(...rows.map((r) => r[idx]?.length ?? 0)));
  return rows
    .map((row) => row.map((cell, idx) => cell.padEnd(widths[idx] ?? 0)).join('  '))
    .join('\n');
}

/** Center tab: source/DDL/columns of one Oracle object with gutter + virtualized lines. */
export function OracleObjectViewer({
  connectionId,
  schema,
  objectType,
  objectName,
  mode = 'ddl',
}: OracleObjectViewerProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [search, setSearch] = useState('');
  const [match, setMatch] = useState(-1);
  const callIdRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const callId = crypto.randomUUID();
    callIdRef.current = callId;
    setLoading(true);
    setError('');
    try {
      const action = mode === 'source' ? 'get_object_source' : mode === 'columns' ? 'describe_object' : 'get_ddl';
      const raw = await executeOracleDescribe(
        {
          action,
          ...(connectionId ? { connectionId } : {}),
          ...(schema ? { schema } : {}),
          ...(objectName ? { objectName } : {}),
          ...(objectType ? { objectType } : {}),
          ...(mode === 'columns' ? { pageSize: 200 } : {}),
        },
        undefined,
        callId
      );
      const payload = JSON.parse(raw) as {
        success: boolean;
        error?: string;
        source?: string;
        ddl?: string;
        columns?: unknown;
        truncated?: boolean;
      };
      if (!payload.success) {
        throw new Error(redactOracleText(payload.error || 'Không đọc được đối tượng Oracle.', DEFAULT_ORACLE_CONFIG));
      }
      const rawText =
        mode === 'source'
          ? payload.source ?? ''
          : mode === 'columns'
            ? columnsToText(payload.columns)
            : payload.ddl ?? '';
      const redacted = redactOracleText(rawText, DEFAULT_ORACLE_CONFIG);
      const capped = redacted.slice(0, MAX_CHARS);
      setTruncated(Boolean(payload.truncated) || redacted.length > MAX_CHARS);
      setText(mode === 'columns' ? capped : formatSql(capped));
    } catch (err: any) {
      setError(redactOracleText(err?.message || 'Lỗi khi đọc đối tượng Oracle.', DEFAULT_ORACLE_CONFIG));
    } finally {
      setLoading(false);
    }
  }, [connectionId, schema, objectName, objectType, mode]);

  useEffect(() => {
    void load();
    return () => {
      // Read the ref at teardown: a reload may have replaced the original call id.
      if (callIdRef.current) void cancelToolCall(callIdRef.current);
    };
  }, [load]);

  const lines = useMemo(() => (text ? text.split('\n').slice(0, MAX_LINES) : []), [text]);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 8,
  });
  const visible = useMemo(
    () => virtualizer.getVirtualItems().map((item) => item.index),
    // virtualizer identity is stable; recompute when line count changes.
    [lines.length]
  );

  useEffect(() => {
    if (!search.trim() || !lines.length) {
      setMatch(-1);
      return;
    }
    const needle = search.trim();
    const index = lines.findIndex((line) => line.toLowerCase().includes(needle.toLowerCase()));
    setMatch(index);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'center' });
  }, [search, lines]);

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError('Không thể sao chép vào bảng nhớ tạm.');
    }
  }, [text]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 'var(--gap-8)', padding: 'var(--gap-8)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}>
        <strong style={{ fontSize: 'var(--font-size-ui, 13px)', color: 'var(--fg-strong)' }}>
          {schema ? `${schema}.` : ''}{objectName ?? ''} <span style={{ color: 'var(--fg-muted)' }}>({mode})</span>
        </strong>
        <InputSearch
          allowClear
          size="small"
          placeholder="Tìm trong nội dung..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 220 }}
          aria-label="Tìm trong source"
        />
        <Button size="small" icon={<CopyOutlined />} onClick={() => void copyAll()}>
          Copy
        </Button>
        <Button size="small" onClick={() => void load()}>
          Tải lại
        </Button>
        {match >= 0 ? (
          <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--font-size-small)' }}>Dòng {match + 1}</span>
        ) : null}
      </div>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {truncated ? (
        <Alert type="warning" showIcon message="Nội dung bị giới hạn 200.000 ký tự / 5.000 dòng." />
      ) : null}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', border: '1px solid var(--border, #e9eaee)', background: 'var(--bg-elev, #f7f8fa)' }}>
        {loading ? (
          <div style={{ margin: 'auto' }}><Spin /></div>
        ) : (
          <LineNumberedPane
            scrollRef={scrollRef}
            totalLines={lines.length}
            {...(visible.length ? { visibleLines: visible } : {})}
          >
            <div
              ref={scrollRef}
              style={{ flex: 1, minWidth: 0, overflow: 'auto', font: '12.5px/20px var(--font-mono, monospace)' }}
            >
              <div style={{ height: virtualizer.getTotalSize() || lines.length * LINE_HEIGHT, position: 'relative' }}>
                {virtualizer.getVirtualItems().map((item) => {
                  const line = lines[item.index] ?? '';
                  return (
                    <div
                      key={item.key}
                      data-line={item.index + 1}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: LINE_HEIGHT,
                        transform: `translateY(${item.start}px)`,
                        whiteSpace: 'pre',
                        background: item.index === match ? 'var(--accent-soft, rgba(56,113,225,0.14))' : undefined,
                      }}
                    >
                      <MemoLine content={line} />
                    </div>
                  );
                })}
              </div>
            </div>
          </LineNumberedPane>
        )}
      </div>
    </div>
  );
}

const MemoLine = React.memo(function MemoLine({ content }: { content: string }) {
  return <DiffLineCodeRenderer content={content} isDark={false} language="sql" />;
});
