import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, InputNumber, Select, Spin, useMessage } from '../../components/ui';
import { CopyOutlined, DownloadOutlined, PlayCircleOutlined, StopOutlined } from '../../components/ui/icon';
import { VirtualizedList } from '../virtual/VirtualizedList';
import {
  assertReadOnlyQuery,
  assertSqlclSingleStatement,
  executeOracleQuery,
  getOracleConnectionProfiles,
  listOracleConnectionSummaries,
} from '../../services/ai/oracleSqlclService';
import type { OracleConnectionSummary } from '../../types/oracleSqlcl';
import { cancelToolCall } from '../../services/sshService';
import { generateXlsxBlobFromGrid } from '../../utils/dynamicFileSandbox';
import { saveFileWithPicker, sanitizeFilename } from '../../utils/fileExport';

const ROW_HEIGHT = 28;
const CELL_MAX_WIDTH = 460;

interface Result {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  executionTimeMs: number;
}

export interface OracleSqlComposerProps {
  connectionId?: string;
  composerId?: string;
}

/** Center tab: SELECT-only editor, cancelable run, virtualized grid and Excel export. */
export function OracleSqlComposer({ connectionId }: OracleSqlComposerProps) {
  const message = useMessage();
  const [profiles, setProfiles] = useState<OracleConnectionSummary[]>([]);
  const [selected, setSelected] = useState(connectionId || '');
  const [sql, setSql] = useState('SELECT * FROM DUAL');
  const [limit, setLimit] = useState(1000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const callIdRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    void getOracleConnectionProfiles().then((all) => {
      if (cancelled) return;
      setProfiles(listOracleConnectionSummaries(all));
      if (!selected && all.length) {
        const active = all.find((p) => p.isActive) ?? all[0]!;
        setSelected(active.id);
      }
    });
    return () => {
      cancelled = true;
    };
    // `selected` is only seeded once; a user choice is never overwritten by a reload.
  }, []);

  useEffect(
    () => () => {
      if (callIdRef.current) void cancelToolCall(callIdRef.current);
    },
    []
  );

  const run = useCallback(async () => {
    if (busy) return;
    setError('');
    setResult(null);
    try {
      // Service owns the guards; the UI only surfaces the refusal, never reimplements them.
      const single = assertSqlclSingleStatement(sql);
      assertReadOnlyQuery(single);
    } catch (err: any) {
      setError(String(err?.message || 'Câu lệnh không hợp lệ.'));
      return;
    }

    const callId = crypto.randomUUID();
    callIdRef.current = callId;
    setBusy(true);
    try {
      const raw = await executeOracleQuery(
        {
          query: sql,
          limit,
          ...(selected ? { connectionId: selected } : {}),
        },
        undefined,
        callId
      );
      const payload = JSON.parse(raw) as {
        success: boolean;
        error?: string;
        cancelled?: boolean;
        columns?: string[];
        rows?: unknown[][];
        rowCount?: number;
        truncated?: boolean;
        executionTimeMs?: number;
      };
      if (!payload.success) {
        // User cancellation is not a query failure; do not paint a red error after Cancel.
        if (!payload.cancelled) {
          setError(String(payload.error || 'Truy vấn thất bại.'));
        }
        return;
      }
      setResult({
        columns: payload.columns ?? [],
        rows: payload.rows ?? [],
        rowCount: payload.rowCount ?? 0,
        truncated: Boolean(payload.truncated),
        executionTimeMs: payload.executionTimeMs ?? 0,
      });
    } catch (err: any) {
      setError(String(err?.message || 'Lỗi thực thi truy vấn.'));
    } finally {
      callIdRef.current = '';
      setBusy(false);
    }
  }, [busy, limit, selected, sql]);

  const cancel = useCallback(async () => {
    const callId = callIdRef.current;
    if (callId) {
      await cancelToolCall(callId);
      setBusy(false);
    }
  }, []);

  const exportExcel = useCallback(async () => {
    if (!result?.columns.length) return;
    try {
      const blob = await generateXlsxBlobFromGrid(result.columns, result.rows, 'Oracle Query');
      const name = profiles.find((p) => p.id === selected)?.name ?? 'oracle';
      const filename = sanitizeFilename(
        `oracle_${name}_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.xlsx`
      );
      const saved = await saveFileWithPicker(filename, blob);
      if (saved.saved) message.success('Đã xuất kết quả ra Excel.');
    } catch (err: any) {
      setError(String(err?.message || 'Không xuất được Excel.'));
    }
  }, [message, profiles, result, selected]);

  const options = useMemo(
    () => profiles.map((p) => ({ value: p.id, label: `${p.name} (${p.environment})${p.isActive ? ' · active' : ''}` })),
    [profiles]
  );

  const gridRow = useCallback(
    (row: unknown[], index: number) => (
      <div
        key={index}
        role="row"
        style={{ display: 'flex', height: ROW_HEIGHT, alignItems: 'center', borderBottom: '1px solid var(--border, #e9eaee)', fontSize: 'var(--font-size-small)' }}
      >
        <span style={{ width: 48, flexShrink: 0, color: 'var(--fg-muted)', paddingLeft: 6 }}>{index + 1}</span>
        {row.map((cell, cellIndex) => (
          <span
            key={cellIndex}
            role="cell"
            title={String(cell ?? '')}
            style={{ width: CELL_MAX_WIDTH / Math.max(1, result?.columns.length ?? 1), flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 6px', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {cell === null || cell === undefined ? '' : String(cell)}
          </span>
        ))}
      </div>
    ),
    [result]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 'var(--gap-8)', padding: 'var(--gap-8)' }}>
      <div style={{ display: 'flex', gap: 'var(--gap-8)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          size="small"
          value={selected || undefined}
          placeholder="Chọn kết nối"
          options={options}
          onChange={(value) => setSelected(String(value ?? ''))}
          style={{ width: 230 }}
          aria-label="Kết nối Oracle"
        />
        <InputNumber
          size="small"
          min={1}
          max={1000}
          value={limit}
          onChange={(value) => setLimit(Number(value) || 1000)}
          aria-label="Giới hạn dòng"
        />
        <Button size="small" type="primary" icon={<PlayCircleOutlined />} disabled={busy} onClick={() => void run()}>
          Chạy
        </Button>
        <Button size="small" icon={<StopOutlined />} disabled={!busy} onClick={() => void cancel()}>
          Hủy
        </Button>
        {busy ? <Spin size="small" /> : null}
      </div>

      <textarea
        aria-label="Câu lệnh SQL"
        spellCheck={false}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        style={{
          width: '100%',
          height: 160,
          boxSizing: 'border-box',
          resize: 'vertical',
          padding: 'var(--gap-8)',
          font: '12.5px/1.6 var(--font-mono, monospace)',
          color: 'var(--fg-strong)',
          background: 'var(--bg-elev, #f7f8fa)',
          border: '1px solid var(--border, #e9eaee)',
          borderRadius: 4,
        }}
      />

      {error ? <Alert type="error" showIcon message={error} /> : null}
      {result?.truncated ? (
        <Alert type="warning" showIcon message="Kết quả bị cắt do giới hạn bộ nhớ an toàn." />
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}>
        {result ? (
          <span style={{ color: 'var(--fg-muted)', fontSize: 'var(--font-size-small)' }}>
            {result.rowCount} dòng · {result.executionTimeMs} ms
          </span>
        ) : null}
        <Button
          size="small"
          icon={<DownloadOutlined />}
          disabled={!result?.columns.length}
          onClick={() => void exportExcel()}
        >
          Xuất Excel
        </Button>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!result?.columns.length}
          onClick={() => {
            if (!result) return;
            const text = [result.columns.join('\t'), ...result.rows.map((row) => row.map((v) => String(v ?? '')).join('\t'))].join('\n');
            void navigator.clipboard.writeText(text).catch(() => setError('Không thể sao chép kết quả.'));
          }}
        >
          Copy
        </Button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', border: '1px solid var(--border, #e9eaee)' }}>
        {result?.columns.length ? (
          <>
            <div role="row" style={{ display: 'flex', height: ROW_HEIGHT, alignItems: 'center', background: 'var(--bg-elev, #f7f8fa)', fontWeight: 600, fontSize: 'var(--font-size-small)' }}>
              <span style={{ width: 48, flexShrink: 0 }} />
              {result.columns.map((col) => (
                <span key={col} style={{ width: CELL_MAX_WIDTH / result.columns.length, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 6px' }}>
                  {col}
                </span>
              ))}
            </div>
            <VirtualizedList
              items={result.rows}
              estimateSize={() => ROW_HEIGHT}
              renderItem={gridRow}
              height="calc(100% - 28px)"
              role="grid"
              aria-label="Kết quả truy vấn Oracle"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
