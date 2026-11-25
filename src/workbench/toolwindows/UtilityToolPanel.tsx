import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Checkbox, Input, Modal, Radio, Segmented, Select, useMessage, RadioGroup } from '../../components/ui';
import { CalendarOutlined, CodeOutlined, CopyOutlined, DeleteOutlined, DiffOutlined, ExperimentOutlined, FieldTimeOutlined, FileTextOutlined, FormatPainterOutlined, KeyOutlined, LinkOutlined, MinusOutlined, RobotOutlined, SafetyCertificateOutlined, SaveOutlined, SwapOutlined, ClockCircleOutlined } from '../../components/ui/icon';
import type { EditorViewType } from '../store/layoutStore';
import { renderSafeMarkdown } from '../../utils/markdown';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { createNote } from '../../db/repositories/noteRepo';
import { UtilityToolAIAssistant } from './UtilityToolAIAssistant';
import { LineNumberedPane, computeFoldRanges, countLines } from './LineNumberedPane';
import { getUtilityContent, useUtilityContent, type DevToolContent, type Indent } from './utilityToolContentStore';
import {
  REGEX_MAX_INPUT, REGEX_MAX_MATCHES, REGEX_TIMEOUT_MS, calculateDate, computeHash, dateToTimestamp, decodeJwt,
  decodeText, encodeText, makeUuids, nextCronRuns, parseCron, runRegex, timestampToDate,
  transformText, type HashAlgo, type RegexResult, type TextOp,
} from './utilityToolHelpers';

const splitPaneStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 1px minmax(0, 1fr)',
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
};

function PaneDivider() {
  return <div role="separator" aria-orientation="vertical" style={{ background: 'var(--border-strong, #d1d3d9)' }} />;
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  background: 'var(--bg-island, #fff)',
};
const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--gap-8)',
  padding: '9px 14px',
  borderBottom: '1px solid var(--border, #e9eaee)',
  flexWrap: 'wrap',
};
const toolBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--gap-6)', height: 28, padding: '0 10px',
  border: '1px solid var(--border-strong, #d1d3d9)', borderRadius: 'var(--radius-control)',
  background: 'var(--bg-island, #fff)', color: 'var(--fg, #1f2937)',
  font: 'inherit', fontSize: 'var(--font-size-small, 12px)', cursor: 'pointer',
};
const toolPrimaryBtnStyle: React.CSSProperties = {
  ...toolBtnStyle, background: 'var(--accent, #3871e1)', borderColor: 'var(--accent, #3871e1)', color: '#fff',
};

const editorStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  border: 'none',
  outline: 'none',
  resize: 'none',
  padding: '12px 14px',
  font: '12.5px/1.6 var(--font-mono, monospace)',
  color: 'var(--fg, #1f2937)',
  background: 'var(--bg-island, #fff)',
  tabSize: 2,
  whiteSpace: 'pre',
  overflow: 'auto',
};
const outputStyle: React.CSSProperties = {
  ...editorStyle,
  margin: 0,
  whiteSpace: 'pre-wrap',
  overflow: 'auto',
};
const colHeadStyle: React.CSSProperties = {
  height: 30,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  background: 'var(--bg-elev, #f7f8fa)',
  borderBottom: '1px solid var(--border, #e9eaee)',
  fontSize: 'var(--font-size-small, 12px)',
  fontWeight: 600,
  color: 'var(--fg-secondary, #5f6269)',
};
const footerStyle: React.CSSProperties = {
  height: 28,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--gap-14)',
  padding: '0 14px',
  background: 'var(--bg-elev, #f7f8fa)',
  borderTop: '1px solid var(--border, #e9eaee)',
  color: 'var(--fg-muted, #6c707e)',
  fontSize: 'var(--font-size-xs, 11px)',
};

async function copyToClipboard(text: string, notify: (kind: 'success' | 'error', text: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    notify('success', 'Đã copy');
  } catch {
    notify('error', 'Không copy được');
  }
}

function indentUnit(indent: Indent) {
  return indent === 'tab' ? '\t' : indent === '4' ? '    ' : '  ';
}

/** Inline syntax highlight — keeps output local, no highlighter dependency. */
function highlight(code: string, kind: 'json' | 'xml'): string {
  const escaped = escapeHtml(code);
  if (kind === 'json') {
    return escaped.replace(
      /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      (match, str: string | undefined, colon: string | undefined, bool: string | undefined, num: string | undefined) => {
        if (str !== undefined) {
          const color = colon ? 'var(--syntax-key, #a626a4)' : 'var(--syntax-string, #0a7d4f)';
          return `<span style="color:${color}">${str}</span>${colon ?? ''}`;
        }
        if (bool !== undefined) return `<span style="color:var(--syntax-literal, #b45e00)">${bool}</span>`;
        if (num !== undefined) return `<span style="color:var(--syntax-number, #1f6feb)">${num}</span>`;
        return match;
      }
    );
  }
  // Attribute pass runs first: the tag pass injects `style="..."` and would otherwise
  // be re-matched as an attribute by the second regex.
  return escaped
    .replace(/([\w:.-]+)=(".*?"|&quot;.*?&quot;)/g, '<span style="color:var(--syntax-key, #a626a4)">$1</span>=<span style="color:var(--syntax-string, #0a7d4f)">$2</span>')
    .replace(/(&lt;\/?)([A-Za-z_][\w:.-]*)/g, '$1<span style="color:var(--syntax-tag, #1f6feb)">$2</span>')
    .replace(/&lt;!--[\s\S]*?--&gt;/g, '<span style="color:var(--fg-muted, #6c707e)">$&</span>');
}

/**
 * Two-column panes scroll together vertically. The guard prevents the mirrored
 * scroll event from bouncing back and fighting the user's wheel/trackpad.
 */
export function useSyncedScroll<TLeft extends HTMLElement, TRight extends HTMLElement>() {
  const leftRef = useRef<TLeft | null>(null);
  const rightRef = useRef<TRight | null>(null);
  const syncing = useRef(false);

  const sync = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return;
    const from = source === 'left' ? leftRef.current : rightRef.current;
    const to = source === 'left' ? rightRef.current : leftRef.current;
    if (!from || !to) return;
    const fromMax = from.scrollHeight - from.clientHeight;
    const toMax = to.scrollHeight - to.clientHeight;
    if (fromMax <= 0 || toMax <= 0) return;
    syncing.current = true;
    to.scrollTop = (from.scrollTop / fromMax) * toMax;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, []);

  return {
    leftRef,
    rightRef,
    onLeftScroll: useCallback(() => sync('left'), [sync]),
    onRightScroll: useCallback(() => sync('right'), [sync]),
  };
}

/**
 * XML pretty-printer: DOMParser validates, serialization preserves every node
 * (elements, text, comments, CDATA, processing instructions, doctype) so format
 * never changes document semantics. Mixed content keeps its inline whitespace.
 */
function formatXmlString(xml: string, indent: Indent | ''): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) {
    throw new Error((err.textContent || 'XML parse error').split('\n')[0]?.trim() || 'XML parse error');
  }
  const unit = indent === '' ? '' : indentUnit(indent);
  const nl = unit === '' ? '' : '\n';
  const escapeText = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');
  const significant = (node: Node, parentHasElement: boolean) =>
    node.nodeType !== Node.TEXT_NODE || !parentHasElement || Boolean(node.nodeValue?.trim());

  const serialize = (node: Node, level: number): string => {
    const pad = unit.repeat(level);
    switch (node.nodeType) {
      case Node.TEXT_NODE:
        return escapeText(node.nodeValue ?? '');
      case Node.COMMENT_NODE:
        return pad + '<!--' + escapeText(node.nodeValue ?? '') + '-->' + nl;
      case Node.CDATA_SECTION_NODE:
        return pad + '<![CDATA[' + (node.nodeValue ?? '') + ']]>' + nl;
      case Node.PROCESSING_INSTRUCTION_NODE: {
        const pi = node as ProcessingInstruction;
        return pad + '<?' + escapeText(pi.target) + (pi.data ? ' ' + escapeText(pi.data) : '') + '?>' + nl;
      }
      case Node.DOCUMENT_TYPE_NODE: {
        const doctype = node as DocumentType;
        const decl = doctype.publicId
          ? `<!DOCTYPE ${doctype.name} PUBLIC "${doctype.publicId}" "${doctype.systemId}">`
          : doctype.systemId
          ? `<!DOCTYPE ${doctype.name} SYSTEM "${doctype.systemId}">`
          : `<!DOCTYPE ${doctype.name}>`;
        return decl + nl;
      }
      case Node.ELEMENT_NODE:
        break;
      default:
        return '';
    }
    const element = node as Element;
    let open = pad + '<' + element.tagName;
    for (const attr of Array.from(element.attributes)) {
      open += ` ${attr.name}="${escapeAttr(attr.value)}"`;
    }
    const allChildren = Array.from(element.childNodes);
    const hasElementChild = allChildren.some((child) => child.nodeType === Node.ELEMENT_NODE);
    const children = allChildren.filter((child) => significant(child, hasElementChild));
    if (!children.length) return open + ' />' + nl;
    if (children.every((child) => child.nodeType === Node.TEXT_NODE)) {
      return open + '>' + escapeText(children.map((c) => c.nodeValue).join('')) + '</' + element.tagName + '>' + nl;
    }
    if (hasElementChild && children.some((child) => child.nodeType === Node.TEXT_NODE)) {
      const inline = children
        .map((child) => child.nodeType === Node.TEXT_NODE
          ? escapeText(child.nodeValue ?? '')
          : serialize(child, 0).trimEnd())
        .join('');
      return open + '>' + inline + '</' + element.tagName + '>' + nl;
    }
    if (unit !== '' && !hasElementChild) {
      const inline = children
        .map((child) => child.nodeType === Node.TEXT_NODE ? escapeText(child.nodeValue ?? '') : serialize(child, 0).trimEnd())
        .join('');
      return open + '>' + inline + '</' + element.tagName + '>' + nl;
    }
    return open + '>' + nl + children.map((child) => serialize(child, level + 1)).join('') + pad + '</' + element.tagName + '>' + nl;
  };

  return Array.from(doc.childNodes)
    .filter((node) => significant(node, true))
    .map((node) => serialize(node, 0))
    .join('')
    .trimEnd();
}

const MAX_DIFF_TOKENS = 4000;

type DiffRow = { type: 'same' | 'add' | 'del'; a: string; b: string; an: number | null; bn: number | null };
type DiffResult = { rows: DiffRow[]; changes: number; truncated: boolean };

/** LCS diff — O(n*m), capped below so a pasted log cannot OOM the renderer. */
function diffTokens(a: string[], b: string[]): DiffResult {
  if (a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    const rows: DiffRow[] = [];
    const common = Math.min(a.length, b.length);
    for (let k = 0; k < common; k++) {
      rows.push({ type: a[k] === b[k] ? 'same' : 'del', a: a[k]!, b: a[k] === b[k] ? b[k]! : '', an: k + 1, bn: a[k] === b[k] ? k + 1 : null });
      if (a[k] !== b[k]) {
        rows.push({ type: 'add', a: '', b: b[k]!, an: null, bn: k + 1 });
      }
    }
    for (let k = common; k < a.length; k++) rows.push({ type: 'del', a: a[k]!, b: '', an: k + 1, bn: null });
    for (let k = common; k < b.length; k++) rows.push({ type: 'add', a: '', b: b[k]!, an: null, bn: k + 1 });
    return { rows: rows.slice(0, MAX_DIFF_TOKENS * 2), changes: rows.length - common, truncated: true };
  }
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? 1 + dp[i + 1]![j + 1]! : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const rows: DiffRow[] = [];
  let changes = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', a: a[i]!, b: b[j]!, an: i + 1, bn: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      rows.push({ type: 'del', a: a[i]!, b: '', an: i + 1, bn: null });
      i++;
      changes++;
    } else {
      rows.push({ type: 'add', a: '', b: b[j]!, an: null, bn: j + 1 });
      j++;
      changes++;
    }
  }
  while (i < n) {
    rows.push({ type: 'del', a: a[i]!, b: '', an: i + 1, bn: null });
    i++;
    changes++;
  }
  while (j < m) {
    rows.push({ type: 'add', a: '', b: b[j]!, an: null, bn: j + 1 });
    j++;
    changes++;
  }
  return { rows, changes, truncated: false };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
}

const ELLIPSIS_MARKUP = ' <span style="color:var(--fg-muted)">…</span>';

type SaveKind = 'download' | 'docs';
type SaveFormat = { extension: string; content: () => string };

type SaveAsModalProps = {
  open: boolean;
  defaultName: string;
  formats: SaveFormat[];
  db: TaskPlannerDatabase;
  onClose: () => void;
};

function SaveAsModal({ open, defaultName, formats, db, onClose }: SaveAsModalProps) {
  const message = useMessage();
  const [kind, setKind] = useState<SaveKind>('download');
  const [extension, setExtension] = useState(formats[0]?.extension ?? '');
  const [name, setDefaultName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  // Callers rebuild `formats` inline every render. Depending on it here re-ran
  // this effect (and its three setState calls) on every editor keystroke.
  const formatsRef = useRef(formats);
  formatsRef.current = formats;
  useEffect(() => {
    if (!open) return;
    setKind('download');
    setExtension(formatsRef.current[0]?.extension ?? '');
    setDefaultName(defaultName);
  }, [open, defaultName]);

  const save = async () => {
    const trimmed = name.trim();
    const format = formats.find((f) => f.extension === extension) ?? formats[0];
    if (!trimmed || !format) {
      message.error('Nhập tên file/doc');
      return;
    }
    const content = format.content();
    setSaving(true);
    try {
      if (kind === 'download') {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${trimmed}.${format.extension}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        message.success('Đã tải file xuống');
      } else {
        await createNote({
          type: 'document',
          title: `${trimmed}.${format.extension}`,
          body: content,
          tags: ['utility-tool'],
        }, db);
        message.success('Đã lưu vào Docs');
      }
      onClose();
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Save as"
      open={open}
      onOk={save}
      confirmLoading={saving}
      okText={kind === 'download' ? 'Tải về máy' : 'Lưu vào Docs'}
      cancelText="Hủy"
      onCancel={onClose}
      destroyOnClose
    >
      <RadioGroup value={kind} onChange={(e) => setKind(e.target.value)} style={{ marginBottom: 16 }}>
        <Radio value="download">Tải về máy</Radio>
        <Radio value="docs">Lưu vào Docs</Radio>
      </RadioGroup>
      <div style={{ display: 'flex', gap: 'var(--gap-8)' }}>
        <Input aria-label="Tên file/doc" value={name} onChange={(e) => setDefaultName(e.target.value)} placeholder="Tên file/doc" />
        <Select aria-label="Định dạng" value={extension} onChange={setExtension} style={{ width: 110 }} options={formats.map((f) => ({ value: f.extension, label: `.${f.extension}` }))} />
      </div>
    </Modal>
  );
}

type FoldingCodeViewProps = {
  text: string;
  kind: 'json' | 'xml';
  rightRef: React.RefObject<HTMLPreElement | null>;
  onRightScroll: () => void;
  label: 'JSON output' | 'XML output';
  error?: string | null;
};

/** Highlighted code view with gutter folding; source line numbers stay stable. */
function FoldingCodeView({ text, kind, rightRef, onRightScroll, label, error }: FoldingCodeViewProps) {
  const lines = useMemo(() => (error ? [''] : text.split('\n')), [text, error]);
  const ranges = useMemo(() => (error ? [] : computeFoldRanges(text, kind)), [text, kind, error]);
  const [folded, setFolded] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => { setFolded(new Set()); }, [text]);

  const toggleFold = useCallback((lineIndex: number) => {
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(lineIndex)) next.delete(lineIndex);
      else next.add(lineIndex);
      return next;
    });
  }, []);

  const { visibleLines, collapsedLines, foldableLines } = useMemo(() => {
    const visibleLines: number[] = [];
    const collapsedLines = new Set<number>();
    const foldableLines = new Set(ranges.map((r) => r.openLine));
    const openByLine = new Map(ranges.map((r) => [r.openLine, r]));
    let skipUntil = -1;
    for (let i = 0; i < lines.length; i++) {
      if (i <= skipUntil) continue;
      visibleLines.push(i);
      const range = openByLine.get(i);
      if (range && folded.has(i)) {
        collapsedLines.add(i);
        skipUntil = range.closeLine;
      }
    }
    return { visibleLines, collapsedLines, foldableLines };
  }, [lines, ranges, folded]);

  const html = useMemo(() => error
    ? escapeHtml(`❌ ${error}`)
    : visibleLines.map((i) =>
        highlight(lines[i] ?? '', kind) +
        (collapsedLines.has(i) ? ELLIPSIS_MARKUP : '') +
        (i < lines.length - 1 ? '\n' : '')
      ).join(''), [error, visibleLines, lines, kind, collapsedLines]);

  return (
    <LineNumberedPane
      scrollRef={rightRef}
      totalLines={lines.length}
      visibleLines={visibleLines}
      foldableLines={foldableLines}
      collapsedLines={collapsedLines}
      onToggleFold={toggleFold}
    >
      <pre ref={rightRef} onScroll={onRightScroll} aria-label={label} style={{ ...outputStyle, whiteSpace: 'pre' }} dangerouslySetInnerHTML={{ __html: html }} />
    </LineNumberedPane>
  );
}

function JsonFormatter({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const message = useMessage();
  const notify = (kind: 'success' | 'error', text: string) => message[kind](text);
  const [saveOpen, setSaveOpen] = useState(false);
  const [content, patchContent, clearContent] = useUtilityContent('json_formatter', instanceKey);
  const { input, output, error, formatted, indent } = content;
  const [aiOpen, setAiOpen] = useState(false);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLPreElement>();

  const run = useCallback((minify: boolean) => {
    const { input: current, indent: currentIndent } = getUtilityContent('json_formatter', instanceKey);
    if (!current.trim()) {
      patchContent({ output: '', error: null });
      return;
    }
    try {
      const value = JSON.parse(current);
      patchContent({ output: JSON.stringify(value, null, minify ? undefined : indentUnit(currentIndent)), formatted: true, error: null });
    } catch (e) {
      patchContent({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [patchContent, instanceKey]);

  const onInput = (value: string) => {
    patchContent({ input: value, error: null, formatted: false, ...(!value.trim() ? { output: '' } : {}) });
  };

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} title="Format JSON" onClick={() => run(false)}><FormatPainterOutlined /> Format</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} title="Minify JSON" onClick={() => run(true)}><MinusOutlined /> Minify</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Copy input" title="Copy input" onClick={() => copyToClipboard(input, notify)}><CopyOutlined /> Copy input</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Copy output" title="Copy output" onClick={() => copyToClipboard(output, notify)}><CopyOutlined /> Copy output</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Clear" title="Clear" onClick={clearContent}><DeleteOutlined /> Clear</button>
        <select
          aria-label="Indent"
          value={indent}
          onChange={(e) => patchContent({ indent: e.target.value as Indent })}
          style={{ ...toolBtnStyle, width: 100 }}
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Save as" title="Save as" onClick={() => setSaveOpen(true)}><SaveOutlined /> Save as</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="AI · JSON Formatter" title="AI · JSON Formatter" onClick={() => setAiOpen(true)}><RobotOutlined /> AI</button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: error ? 'var(--danger, #d1484f)' : 'var(--fg-muted, #6c707e)' }}>
          {error ? `❌ ${error}` : formatted ? '✓ JSON hợp lệ' : input.trim() ? 'Đã thay đổi · bấm Format' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>INPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{input.length} ký tự</span></div>
          <LineNumberedPane scrollRef={leftRef} totalLines={countLines(input)}>
            <textarea ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label="JSON input" spellCheck={false} style={editorStyle} value={input} onChange={(e) => onInput(e.target.value)} placeholder={'Dán JSON vào đây, ví dụ: {"name":"TaskMate","ok":true}'} />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>OUTPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>đã format</span></div>
          <FoldingCodeView text={output} kind="json" rightRef={rightRef} onRightScroll={onRightScroll} label="JSON output" error={error} />
        </div>
      </div>
      <div style={footerStyle}><span>JSON · UTF-8</span><span>{output ? countLines(output) : 0} dòng</span></div>
      {saveOpen && <SaveAsModal
        open={saveOpen}
        defaultName="formatted"
        formats={[{ extension: 'json', content: () => output || input }]}
        db={db}
        onClose={() => setSaveOpen(false)}
      />}
      {aiOpen && <UtilityToolAIAssistant
        open={aiOpen}
        toolId="json_formatter"
        content={input}
        onApply={(v) => patchContent({ input: v, output: '', error: null, formatted: false })}
        onClose={() => setAiOpen(false)}
        db={db}
      />}
    </div>
  );
}

function XmlFormatter({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const message = useMessage();
  const notify = (kind: 'success' | 'error', text: string) => message[kind](text);
  const [saveOpen, setSaveOpen] = useState(false);
  const [content, patchContent, clearContent] = useUtilityContent('xml_formatter', instanceKey);
  const { input, output, error, formatted, indent } = content;
  const [aiOpen, setAiOpen] = useState(false);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLPreElement>();

  const run = useCallback((minify: boolean) => {
    const { input: current, indent: currentIndent } = getUtilityContent('xml_formatter', instanceKey);
    if (!current.trim()) {
      patchContent({ output: '', error: null });
      return;
    }
    try {
      patchContent({ output: formatXmlString(current, minify ? '' : currentIndent), formatted: true, error: null });
    } catch (e) {
      patchContent({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [patchContent, instanceKey]);

  const onInput = (value: string) => {
    patchContent({ input: value, error: null, formatted: false, ...(!value.trim() ? { output: '' } : {}) });
  };

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} title="Format XML" onClick={() => run(false)}><FormatPainterOutlined /> Format</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} title="Minify XML" onClick={() => run(true)}><MinusOutlined /> Minify</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Copy input" title="Copy input" onClick={() => copyToClipboard(input, notify)}><CopyOutlined /> Copy input</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Copy output" title="Copy output" onClick={() => copyToClipboard(output, notify)}><CopyOutlined /> Copy output</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Clear" title="Clear" onClick={clearContent}><DeleteOutlined /> Clear</button>
        <select
          aria-label="Indent"
          value={indent}
          onChange={(e) => patchContent({ indent: e.target.value as Indent })}
          style={{ ...toolBtnStyle, width: 100 }}
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Save as" title="Save as" onClick={() => setSaveOpen(true)}><SaveOutlined /> Save as</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="AI · XML Formatter" title="AI · XML Formatter" onClick={() => setAiOpen(true)}><RobotOutlined /> AI</button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: error ? 'var(--danger, #d1484f)' : 'var(--fg-muted, #6c707e)' }}>
          {error ? `❌ ${error}` : formatted ? '✓ XML hợp lệ' : input.trim() ? 'Đã thay đổi · bấm Format' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>INPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{input.length} ký tự</span></div>
          <LineNumberedPane scrollRef={leftRef} totalLines={countLines(input)}>
            <textarea ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label="XML input" spellCheck={false} style={editorStyle} value={input} onChange={(e) => onInput(e.target.value)} placeholder={'Dán XML vào đây, ví dụ: <note><to>Quan</to></note>'} />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>OUTPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>đã format</span></div>
          <FoldingCodeView text={output} kind="xml" rightRef={rightRef} onRightScroll={onRightScroll} label="XML output" error={error} />
        </div>
      </div>
      <div style={footerStyle}><span>XML · UTF-8</span><span>{output ? countLines(output) : 0} dòng</span></div>
      {saveOpen && <SaveAsModal
        open={saveOpen}
        defaultName="formatted"
        formats={[{ extension: 'xml', content: () => output || input }]}
        db={db}
        onClose={() => setSaveOpen(false)}
      />}
      {aiOpen && <UtilityToolAIAssistant
        open={aiOpen}
        toolId="xml_formatter"
        content={input}
        onApply={(v) => patchContent({ input: v, output: '', error: null, formatted: false })}
        onClose={() => setAiOpen(false)}
        db={db}
      />}
    </div>
  );
}

function TextCompare({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [content, patchContent, clearContent] = useUtilityContent('text_compare', instanceKey);
  const { a, b, mode, ignoreCase, ignoreSpace } = content;
  const setA = (a: string) => patchContent({ a });
  const setB = (b: string) => patchContent({ b });
  const [aiOpen, setAiOpen] = useState(false);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLTextAreaElement>();

  const result = useMemo<DiffResult>(() => {
    if (!a.trim() && !b.trim()) return { rows: [], changes: 0, truncated: false };
    const normalize = (s: string) => {
      let v = s.replace(/\r\n?/g, '\n');
      if (ignoreCase) v = v.toLowerCase();
      if (ignoreSpace) v = v.replace(/[ \t]+/g, ' ').trim();
      return v;
    };
    const tokenize = (s: string) => {
      const v = normalize(s);
      return mode === 'lines' ? v.split('\n') : v.split(/(\s+)/).filter((t) => t.trim());
    };
    return diffTokens(tokenize(a), tokenize(b));
  }, [a, b, mode, ignoreCase, ignoreSpace]);

  const unit = mode === 'lines' ? 'dòng' : 'từ';
  const countA = mode === 'lines' ? countLines(a) : a.split(/\s+/).filter(Boolean).length;
  const countB = mode === 'lines' ? countLines(b) : b.split(/\s+/).filter(Boolean).length;
  const rowStyle = (type: DiffRow['type']): React.CSSProperties => {
    const color =
      type === 'add' ? 'var(--success-bg, #e6f6ec)' : type === 'del' ? 'var(--danger-bg, #fdeaea)' : 'transparent';
    return { background: color };
  };

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <Segmented<'lines' | 'words'>
          value={mode}
          onChange={(v) => patchContent({ mode: v })}
          options={[{ label: 'Theo dòng', value: 'lines' }, { label: 'Theo từ', value: 'words' }]}
        />
        <Checkbox checked={ignoreCase} onChange={(e) => patchContent({ ignoreCase: e.target.checked })}>Bỏ qua hoa/thường</Checkbox>
        <Checkbox checked={ignoreSpace} onChange={(e) => patchContent({ ignoreSpace: e.target.checked })}>Bỏ qua khoảng trắng</Checkbox>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} title="Đổi chiều" onClick={() => { setA(b); setB(a); }}><SwapOutlined /> Đổi chiều</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Clear" title="Xóa cả hai" onClick={clearContent}><DeleteOutlined /> Xóa cả hai</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Save as" title="Save as" onClick={() => setSaveOpen(true)}><SaveOutlined /> Save as</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="AI · Text Compare" title="AI · Text Compare" onClick={() => setAiOpen(true)}><RobotOutlined /> AI</button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: result.changes ? 'var(--warning, #a56906)' : 'var(--success, #338555)' }}>
          {!a.trim() && !b.trim()
            ? 'Dán 2 đoạn text để so sánh'
            : `${result.truncated ? '⚠ Quá lớn · so sánh trực tiếp, ' : ''}${result.changes ? `⚠ ${result.changes} thay đổi` : '✓ Hai đoạn giống hệt'}`}
        </span>
      </div>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>A — GỐC <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{countA} {unit}</span></div>
          <LineNumberedPane scrollRef={leftRef} totalLines={countLines(a)}>
            <textarea ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label="Text A" spellCheck={false} style={editorStyle} value={a} onChange={(e) => setA(e.target.value)} placeholder="Text gốc..." />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>B — MỚI <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{countB} {unit}</span></div>
          <LineNumberedPane scrollRef={rightRef} totalLines={countLines(b)}>
            <textarea ref={rightRef} wrap="off" onScroll={onRightScroll} aria-label="Text B" spellCheck={false} style={editorStyle} value={b} onChange={(e) => setB(e.target.value)} placeholder="Text cần so sánh..." />
          </LineNumberedPane>
        </div>
      </div>
      <div style={{ height: '34%', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-strong, #d1d3d9)' }}>
        <div style={colHeadStyle}>KẾT QUẢ KHÁC BIỆT</div>
        <div style={{ flex: 1, overflow: 'auto', font: '12.5px/1.55 var(--font-mono, monospace)' }}>
          {result.rows.length ? (
            result.rows.map((row, idx) => (
              <div key={idx} style={{ ...rowStyle(row.type), display: 'grid', gridTemplateColumns: '28px 44px 1fr 20px 1fr 44px' }}>
                <span style={{ padding: '1px 6px', textAlign: 'right', color: 'var(--fg-muted)', background: 'var(--bg-elev, #f7f8fa)' }}>{idx + 1}</span>
                <span style={{ padding: '1px 8px', textAlign: 'right', color: 'var(--fg-muted)', background: 'var(--bg-elev, #f7f8fa)' }}>{row.an ?? ''}</span>
                <span style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: escapeHtml(row.a) }} />
                <span style={{ textAlign: 'center', color: row.type === 'del' ? 'var(--danger)' : row.type === 'add' ? 'var(--success)' : 'var(--fg-muted)' }}>
                  {row.type === 'del' ? '−' : row.type === 'add' ? '+' : ''}
                </span>
                <span style={{ padding: '1px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} dangerouslySetInnerHTML={{ __html: escapeHtml(row.b) }} />
                <span style={{ padding: '1px 8px', textAlign: 'right', color: 'var(--fg-muted)', background: 'var(--bg-elev, #f7f8fa)' }}>{row.bn ?? ''}</span>
              </div>
            ))
          ) : (
            <div style={{ padding: 12, color: 'var(--fg-muted)' }}>Dán 2 đoạn text để so sánh.</div>
          )}
        </div>
      </div>
      {saveOpen && <SaveAsModal
        open={saveOpen}
        defaultName="comparison"
        formats={[{ extension: 'txt', content: () => b }]}
        db={db}
        onClose={() => setSaveOpen(false)}
      />}
      {aiOpen && <UtilityToolAIAssistant
        open={aiOpen}
        toolId="text_compare"
        content={b}
        contextContent={a}
        contextLabel="A — GỐC (tham khảo)"
        onApply={setB}
        onClose={() => setAiOpen(false)}
        db={db}
      />}
    </div>
  );
}

function MarkdownViewer({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const message = useMessage();
  const notify = (kind: 'success' | 'error', text: string) => message[kind](text);
  const [saveOpen, setSaveOpen] = useState(false);
  const [content, patchContent, clearContent] = useUtilityContent('markdown_viewer', instanceKey);
  const { source } = content;
  const setSource = (source: string) => patchContent({ source });
  const [aiOpen, setAiOpen] = useState(false);
  const rendered = useMemo(() => renderSafeMarkdown(source), [source]);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLDivElement>();

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} title="Copy source" onClick={() => copyToClipboard(source, notify)}><CopyOutlined /> Copy</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} title="Clear" onClick={clearContent}><DeleteOutlined /> Clear</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Save as" title="Save as" onClick={() => setSaveOpen(true)}><SaveOutlined /> Save as</button>
        <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="AI · Markdown Viewer" title="AI · Markdown Viewer" onClick={() => setAiOpen(true)}><RobotOutlined /> AI</button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: 'var(--fg-muted, #6c707e)' }}>
          {source.length} ký tự · {source.trim() ? 'Đã cập nhật' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>SOẠN</div>
          <LineNumberedPane scrollRef={leftRef} totalLines={countLines(source)}>
            <textarea ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label="Markdown editor" spellCheck={false} style={editorStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Dán Markdown vào đây..." />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>XEM TRƯỚC</div>
          <LineNumberedPane scrollRef={rightRef} totalLines={countLines(source)}>
            <div ref={rightRef} onScroll={onRightScroll} aria-label="Markdown preview" className="markdown-rendered-view" style={{ ...outputStyle, whiteSpace: 'normal' }} dangerouslySetInnerHTML={{ __html: rendered }} />
          </LineNumberedPane>
        </div>
      </div>
      <div style={footerStyle}><span>Markdown · UTF-8</span><span>{rendered ? 'Đã render' : 'Chưa có nội dung'}</span></div>
      {saveOpen && <SaveAsModal
        open={saveOpen}
        defaultName="document"
        formats={[{ extension: 'md', content: () => source }]}
        db={db}
        onClose={() => setSaveOpen(false)}
      />}
      {aiOpen && <UtilityToolAIAssistant
        open={aiOpen}
        toolId="markdown_viewer"
        content={source}
        onApply={setSource}
        onClose={() => setAiOpen(false)}
        db={db}
      />}
    </div>
  );
}

const selectStyle = { ...toolBtnStyle, minWidth: 108 };
const noteStyle: React.CSSProperties = { fontSize: 'var(--font-size-xs, 11px)', color: 'var(--fg-muted, #6c707e)' };

function DevToolbar({ children }: { children: React.ReactNode }) {
  return <div style={toolbarStyle}>{children}</div>;
}

function DevFooter({ children }: { children: React.ReactNode }) {
  return <div style={footerStyle}>{children}</div>;
}

/** Visible label for a toolbar control — aria-label already covers assistive tech. */
function DevField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    <span style={{ fontSize: 'var(--font-size-xs, 11px)', color: 'var(--fg-muted, #6c707e)', whiteSpace: 'nowrap' }}>{label}</span>
    {children}
  </label>;
}

/** One-line, tool-specific usage guidance shown above the input/output panes. */
function DevHelp({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '6px 14px', background: 'var(--bg-elev, #f7f8fa)', borderBottom: '1px solid var(--border, #e9eaee)', color: 'var(--fg-muted, #6c707e)', fontSize: 'var(--font-size-small, 12px)' }}>{children}</div>;
}

function DevPanes({ inputLabel, outputLabel, input, output, inputAria, outputAria, inputPlaceholder, onInput, extra }: {
  inputLabel: string; outputLabel: string; input: string; output: string;
  inputAria: string; outputAria: string; inputPlaceholder: string;
  onInput: (value: string) => void; extra?: React.ReactNode;
}) {
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLPreElement>();
  return (
    <>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          <div style={colHeadStyle}><label htmlFor={`dev-input-${inputAria.replace(/\s+/g, '-')}`}>{inputLabel}</label></div>
          <LineNumberedPane scrollRef={leftRef} totalLines={countLines(input)}>
            <textarea id={`dev-input-${inputAria.replace(/\s+/g, '-')}`} ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label={inputAria} spellCheck={false} style={editorStyle} value={input} onChange={(e) => onInput(e.target.value)} placeholder={inputPlaceholder} />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          <div style={colHeadStyle}><label htmlFor={`dev-output-${outputAria.replace(/\s+/g, '-')}`}>{outputLabel}</label></div>
          <LineNumberedPane scrollRef={rightRef} totalLines={countLines(output)}>
            <pre id={`dev-output-${outputAria.replace(/\s+/g, '-')}`} ref={rightRef} onScroll={onRightScroll} aria-label={outputAria} style={outputStyle}>{output}</pre>
          </LineNumberedPane>
        </div>
      </div>
      {extra}
    </>
  );
}

function useCommonToolbar(id: string, content: DevToolContent, patch: (p: Partial<DevToolContent>) => void, clear: () => void, db: TaskPlannerDatabase, controls?: React.ReactNode, outputOverride?: string) {
  const message = useMessage();
  const [aiOpen, setAiOpen] = useState(false);
  const outputRef = useRef(outputOverride ?? content.output);
  outputRef.current = outputOverride ?? content.output;
  const node = (children: React.ReactNode = null) => (
    <>
      <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Copy output" title="Copy output" onClick={() => copyToClipboard(outputRef.current, (k, t) => message[k](t))}><CopyOutlined /> Copy output</button>
      <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label="Clear" title="Clear" onClick={clear}><DeleteOutlined /> Clear</button>
      <button type="button" className="utility-tool-btn" style={toolBtnStyle} aria-label={`AI · ${TOOL_LABELS[id]}`} title={`AI · ${TOOL_LABELS[id]}`} onClick={() => setAiOpen(true)}><RobotOutlined /> AI</button>
      {children ?? controls}
      {aiOpen && <UtilityToolAIAssistant
        open={aiOpen}
        toolId={id}
        content={content.input}
        onApply={(v) => patch({ input: v, output: '', error: null })}
        onClose={() => setAiOpen(false)}
        db={db}
      />}
    </>
  );
  return node;
}

const TOOL_LABELS: Record<string, string> = {
  encoder_decoder: 'Encoder/Decoder', regex_tester: 'Regex Tester', timestamp_converter: 'Timestamp Converter',
  date_calculation: 'Date Calculation', text_utilities: 'Text Utilities', cron_expression: 'Cron Expression',
  hash_uuid: 'Hash & UUID', jwt_decoder: 'JWT Decoder',
};

function EncoderPanel({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [content, patchContent, clearContent] = useUtilityContent('encoder_decoder', instanceKey);
  const { input, option, option2, output, error } = content;
  const run = useCallback(() => {
    if (!input) { patchContent({ output: '', error: null }); return; }
    try {
      const kind = (option2 || 'base64') as 'base64' | 'url' | 'html';
      patchContent({ output: option === 'decode' ? decodeText(input, kind) : encodeText(input, kind), error: null });
    } catch (e) {
      patchContent({ output: '', error: e instanceof Error ? e.message : String(e) });
    }
  }, [input, option, option2, patchContent]);
  const toolbar = useCommonToolbar('encoder_decoder', content, patchContent, clearContent, db, undefined, output);
  const onInput = useCallback((value: string) => patchContent({ input: value, output: '', error: null }), [patchContent]);
  return (
    <div style={panelStyle}>
      <DevToolbar>{toolbar(
        <>
          <DevField label="Chiều"><select aria-label="Chiều" value={option || 'encode'} onChange={(e) => patchContent({ option: e.target.value, output: '', error: null })} style={selectStyle}>
            <option value="encode">Encode</option><option value="decode">Decode</option>
          </select></DevField>
          <DevField label="Định dạng"><select aria-label="Định dạng" value={option2 || 'base64'} onChange={(e) => patchContent({ option2: e.target.value, output: '', error: null })} style={selectStyle}>
            <option value="base64">Base64</option><option value="url">URL</option><option value="html">HTML</option>
          </select></DevField>
          <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} onClick={run}>Chạy</button>
        </>
      )}<span style={{ marginLeft: 'auto', color: error ? 'var(--danger, #d1484f)' : noteStyle.color, fontSize: noteStyle.fontSize }}>{error ? `❌ ${error}` : 'UTF-8 · local'}</span></DevToolbar>
      <DevHelp>Nhập text, chọn chiều Encode/Decode và định dạng, rồi bấm Chạy. Dùng Decode với đúng định dạng đã dùng để Encode.</DevHelp>
      <DevPanes inputLabel="INPUT" outputLabel="OUTPUT" input={input} output={output} inputAria="Encoder input" outputAria="Encoder output" inputPlaceholder="Dán text vào đây..." onInput={onInput} />
      <DevFooter><span>Encode/Decode · UTF-8</span><span>{output.length} ký tự</span></DevFooter>
    </div>
  );
}

function RegexTesterPanel({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [content, patchContent, clearContent] = useUtilityContent('regex_tester', instanceKey);
  const { input, aux, option2 } = content;
  const [result, setResult] = useState<RegexResult>({ matches: [], count: 0, truncated: false, error: null });
  const [running, setRunning] = useState(false);
  const seqRef = useRef(0);
  const run = useCallback(() => {
    const mySeq = ++seqRef.current;
    if (!aux.trim() || !input) {
      setResult({ matches: [], count: 0, truncated: false, error: null });
      setRunning(false);
      return;
    }
    setRunning(true);
    void runRegex(aux, option2, input).then((next) => {
      if (seqRef.current === mySeq) {
        setResult(next);
        setRunning(false);
      }
    });
  }, [aux, option2, input]);
  const reset = useCallback((p: Partial<DevToolContent>) => {
    seqRef.current++;
    setResult({ matches: [], count: 0, truncated: false, error: null });
    setRunning(false);
    patchContent(p);
  }, [patchContent]);
  const onInput = useCallback((value: string) => reset({ input: value }), [reset]);
  const details = useMemo(() => result.matches.map((m, i) => `${i + 1}. @${m.index} ${JSON.stringify(m.value)}${m.groups.length ? ` groups=${JSON.stringify(m.groups)}` : ''}`).join('\n'), [result.matches]);
  const toolbar = useCommonToolbar('regex_tester', content, patchContent, clearContent, db, undefined, details);
  return (
    <div style={panelStyle}>
      <DevToolbar>{toolbar(
        <>
          <DevField label="Pattern"><input aria-label="Pattern" value={aux} onChange={(e) => reset({ aux: e.target.value })} placeholder="Ví dụ: (a+)(b)" style={{ ...toolBtnStyle, width: 200, cursor: 'text' }} /></DevField>
          <DevField label="Flags"><input aria-label="Flags" value={option2} onChange={(e) => reset({ option2: e.target.value })} placeholder="ví dụ: gi" style={{ ...toolBtnStyle, width: 60, cursor: 'text' }} /></DevField>
          <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} onClick={run}>Chạy</button>
        </>
      )}<span style={{ marginLeft: 'auto', color: result.error ? 'var(--danger, #d1484f)' : 'var(--fg-muted, #6c707e)', fontSize: 'var(--font-size-small, 12px)' }}>
        {result.error ? `❌ ${result.error}` : running ? 'Đang chạy trong Worker...' : result.truncated ? `⚠ Giới hạn ${REGEX_MAX_MATCHES} match` : `${result.count} match`}
      </span></DevToolbar>
      <DevHelp>Nhập pattern, flags tùy chọn (vd. gi) và chuỗi cần thử, rồi bấm Chạy. Regex chạy trong Worker, tự hủy sau {REGEX_TIMEOUT_MS} ms nếu pattern gây ReDoS.</DevHelp>
      <DevPanes inputLabel="CHUỖI TEST" outputLabel="KẾT QUẢ" input={input} output={details} inputAria="Regex test input" outputAria="Regex matches" inputPlaceholder="Dán chuỗi cần thử..." onInput={onInput} />
      <DevFooter><span>Regex · input tối đa {REGEX_MAX_INPUT.toLocaleString('vi-VN')} ký tự</span><span>Chạy trong Worker · tự hủy sau {REGEX_TIMEOUT_MS} ms để chặn ReDoS</span></DevFooter>
    </div>
  );
}

function TimestampPanel({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [content, patchContent, clearContent] = useUtilityContent('timestamp_converter', instanceKey);
  const { input, option, option2, output, error } = content;
  const run = useCallback(() => {
    if (!input.trim()) { patchContent({ output: '', error: null }); return; }
    try {
      patchContent({ output: JSON.stringify(option === 'to_timestamp' ? dateToTimestamp(input) : timestampToDate(input, option2 === 's' ? 's' : 'ms'), null, 2), error: null });
    } catch (e) {
      patchContent({ output: '', error: e instanceof Error ? e.message : String(e) });
    }
  }, [input, option, option2, patchContent]);
  const onInput = useCallback((value: string) => patchContent({ input: value, output: '', error: null }), [patchContent]);
  const toolbar = useCommonToolbar('timestamp_converter', content, patchContent, clearContent, db, undefined, output);
  const useNow = () => patchContent({
    input: option === 'to_timestamp' ? dayjs().format('YYYY-MM-DD') : String(option2 === 's' ? Math.floor(Date.now() / 1000) : Date.now()),
    output: '', error: null,
  });
  return (
    <div style={panelStyle}>
      <DevToolbar>{toolbar(
        <>
          <DevField label="Chiều"><select aria-label="Chiều" value={option || 'to_date'} onChange={(e) => patchContent({ option: e.target.value, output: '', error: null })} style={selectStyle}>
            <option value="to_date">Timestamp → Date</option><option value="to_timestamp">Date → Timestamp</option>
          </select></DevField>
          <DevField label="Đơn vị"><select aria-label="Đơn vị" value={option2 || 'ms'} onChange={(e) => patchContent({ option2: e.target.value, output: '', error: null })} style={{ ...toolBtnStyle, minWidth: 64 }}>
            <option value="ms">ms</option><option value="s">s</option>
          </select></DevField>
          <button type="button" className="utility-tool-btn" style={toolBtnStyle} onClick={useNow}>Dùng now</button>
          <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} onClick={run}>Chạy</button>
        </>
      )}<span style={{ marginLeft: 'auto', color: error ? 'var(--danger, #d1484f)' : noteStyle.color, fontSize: noteStyle.fontSize }}>{error ? `❌ ${error}` : 'dayjs · local'}</span></DevToolbar>
      <DevHelp>Nhập timestamp hoặc ngày YYYY-MM-DD, chọn chiều và đơn vị (ms/s), rồi bấm Chạy. "Dùng now" điền giá trị hiện tại; kết quả tính theo UTC.</DevHelp>
      <DevPanes inputLabel="INPUT" outputLabel="OUTPUT" input={input} output={output} inputAria="Timestamp input" outputAria="Timestamp output" inputPlaceholder={option === 'to_date' ? '1700000000000' : 'YYYY-MM-DD'} onInput={onInput} />
      <DevFooter><span>Timestamp · UTC ổn định</span><span>{error || 'Sẵn sàng'}</span></DevFooter>
    </div>
  );
}

function DateCalcPanel({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [content, patchContent, clearContent] = useUtilityContent('date_calculation', instanceKey);
  const { input, aux, option, option2, output, error } = content;
  const [amount, setAmount] = useState(1);
  const op = (option || 'add') as 'add' | 'subtract' | 'diff';
  const unit = (option2 || 'day') as 'day' | 'week' | 'month' | 'year';
  const run = useCallback(() => {
    const result = calculateDate({ date: input, op, amount, unit, ...(aux ? { compareDate: aux } : {}) });
    patchContent({ output: result.output, error: result.error });
  }, [input, aux, op, amount, unit, patchContent]);
  const onInput = useCallback((value: string) => patchContent({ input: value, output: '', error: null }), [patchContent]);
  const isDiff = op === 'diff';
  const toolbar = useCommonToolbar('date_calculation', content, patchContent, clearContent, db, undefined, output);
  return (
    <div style={panelStyle}>
      <DevToolbar>{toolbar(
        <>
          <DevField label="Phép tính"><select aria-label="Phép tính" value={option || 'add'} onChange={(e) => patchContent({ option: e.target.value, output: '', error: null })} style={selectStyle}>
            <option value="add">Cộng</option><option value="subtract">Trừ</option><option value="diff">Hiệu ngày</option>
          </select></DevField>
          {!isDiff && <DevField label="Số lượng"><select aria-label="Số lượng" value={amount} onChange={(e) => { setAmount(Number(e.target.value)); patchContent({ output: '', error: null }); }} style={{ ...toolBtnStyle, minWidth: 62 }}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select></DevField>}
          {!isDiff && <DevField label="Đơn vị"><select aria-label="Đơn vị" value={option2 || 'day'} onChange={(e) => patchContent({ option2: e.target.value, output: '', error: null })} style={{ ...toolBtnStyle, minWidth: 76 }}>
            <option value="day">ngày</option><option value="week">tuần</option><option value="month">tháng</option><option value="year">năm</option>
          </select></DevField>}
          {isDiff && <DevField label="Ngày so sánh"><input aria-label="Ngày so sánh" value={aux} onChange={(e) => patchContent({ aux: e.target.value, output: '', error: null })} placeholder="YYYY-MM-DD" style={{ ...toolBtnStyle, width: 130, cursor: 'text' }} /></DevField>}
          <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} onClick={run}>Chạy</button>
        </>
      )}<span style={{ marginLeft: 'auto', color: error ? 'var(--danger, #d1484f)' : noteStyle.color, fontSize: noteStyle.fontSize }}>{error ? `❌ ${error}` : 'YYYY-MM-DD'}</span></DevToolbar>
      <DevHelp>Nhập ngày YYYY-MM-DD. Chọn Cộng/Trừ kèm số lượng và đơn vị, hoặc Hiệu ngày kèm ngày so sánh. Bấm Chạy để xem kết quả.</DevHelp>
      <DevPanes inputLabel="NGÀY" outputLabel="KẾT QUẢ" input={input} output={output} inputAria="Date input" outputAria="Date result" inputPlaceholder="YYYY-MM-DD" onInput={onInput} />
      <DevFooter><span>Date Calculation · dayjs</span><span>{output || 'Sẵn sàng'}</span></DevFooter>
    </div>
  );
}

const TEXT_OPS: { value: TextOp; label: string }[] = [
  { value: 'upper', label: 'CHỮ HOA' }, { value: 'lower', label: 'chữ thường' }, { value: 'title', label: 'Title Case' },
  { value: 'camel', label: 'camelCase' }, { value: 'snake', label: 'snake_case' }, { value: 'kebab', label: 'kebab-case' },
  { value: 'trim', label: 'Trim' }, { value: 'sort-lines', label: 'Sort dòng' }, { value: 'dedupe-lines', label: 'Bỏ dòng trùng' },
  { value: 'reverse-lines', label: 'Đảo dòng' }, { value: 'remove-blank', label: 'Bỏ dòng trống' }, { value: 'count', label: 'Thống kê' },
];

function TextUtilitiesPanel({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [content, patchContent, clearContent] = useUtilityContent('text_utilities', instanceKey);
  const { input, option, output } = content;
  const run = useCallback(() => patchContent({ output: transformText(input, (option || 'upper') as TextOp) }), [input, option, patchContent]);
  const toolbar = useCommonToolbar('text_utilities', content, patchContent, clearContent, db, undefined, output);
  const onInput = useCallback((value: string) => patchContent({ input: value, output: '' }), [patchContent]);
  return (
    <div style={panelStyle}>
      <DevToolbar>{toolbar(
        <>
          <DevField label="Phép biến đổi"><select aria-label="Phép biến đổi" value={option || 'upper'} onChange={(e) => patchContent({ option: e.target.value, output: '' })} style={{ ...selectStyle, minWidth: 140 }}>
            {TEXT_OPS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
          </select></DevField>
          <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} onClick={run}>Chạy</button>
        </>
      )}</DevToolbar>
      <DevHelp>Nhập text, chọn phép biến đổi (đổi case, sort/dedupe dòng, thống kê...), rồi bấm Chạy. Với camelCase/snake_case, cách nhau bằng dấu cách, gạch dưới hoặc gạch ngang.</DevHelp>
      <DevPanes inputLabel="INPUT" outputLabel="OUTPUT" input={input} output={output} inputAria="Text utilities input" outputAria="Text utilities output" inputPlaceholder="Dán text vào đây..." onInput={onInput} />
      <DevFooter><span>Text Utilities · deterministic, local</span><span>{input.length} ký tự</span></DevFooter>
    </div>
  );
}

function CronPanel({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [content, patchContent, clearContent] = useUtilityContent('cron_expression', instanceKey);
  const { input, output, error } = content;
  const toolbar = useCommonToolbar('cron_expression', content, patchContent, clearContent, db);
  const parsed = useMemo(() => (input.trim() ? parseCron(input.trim()) : null), [input]);
  const run = useCallback(() => {
    if (!input.trim()) return;
    const runs = nextCronRuns(input.trim(), 5);
    patchContent({ output: runs.length ? runs.map((d) => d.toISOString()).join('\n') : '', error: runs.length ? null : 'Biểu thức cron không hợp lệ' });
  }, [input, patchContent]);
  const onInput = useCallback((value: string) => patchContent({ input: value, output: '', error: null }), [patchContent]);
  const status = error || parsed?.error;
  return (
    <div style={panelStyle}>
      <DevToolbar>{toolbar(
        <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} onClick={run}>5 lần chạy tiếp</button>
      )}<span style={{ marginLeft: 'auto', color: status ? 'var(--danger, #d1484f)' : noteStyle.color, fontSize: noteStyle.fontSize }}>{status ? `❌ ${status}` : parsed?.description || '5 trường: phút giờ ngày tháng ngày-tuần'}</span></DevToolbar>
      <DevHelp>Nhập biểu thức cron 5 trường (phút, giờ, ngày, tháng, ngày-tuần), rồi bấm "5 lần chạy tiếp" để xem các lần chạy theo định dạng ISO.</DevHelp>
      <DevPanes inputLabel="BIỂU THỨC CRON" outputLabel="LẦN CHẠY (ISO)" input={input} output={output} inputAria="Cron expression" outputAria="Cron runs" inputPlaceholder="*/15 9 * * 1-5" onInput={onInput} />
      <DevFooter><span>Cron · tự implement, không dependency</span><span>Quét tối đa 4 năm</span></DevFooter>
    </div>
  );
}

function HashUuidPanel({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [content, patchContent, clearContent] = useUtilityContent('hash_uuid', instanceKey);
  const { input, output, error, option, option2 } = content;
  const toolbar = useCommonToolbar('hash_uuid', content, patchContent, clearContent, db);
  const seqRef = useRef(0);
  const runHash = useCallback(async () => {
    const mySeq = ++seqRef.current;
    try {
      const hash = await computeHash(input, (option || 'SHA-256') as HashAlgo);
      if (seqRef.current === mySeq) patchContent({ output: hash, error: null });
    } catch (e) {
      if (seqRef.current === mySeq) patchContent({ output: '', error: e instanceof Error ? e.message : String(e) });
    }
  }, [input, option, patchContent]);
  const makeUuid = useCallback(() => {
    seqRef.current++;
    try {
      patchContent({ output: makeUuids(Number(option2) || 1).join('\n'), error: null });
    } catch (e) {
      patchContent({ output: '', error: e instanceof Error ? e.message : String(e) });
    }
  }, [option2, patchContent]);
  const onInput = useCallback((value: string) => {
    seqRef.current++;
    patchContent({ input: value, output: '', error: null });
  }, [patchContent]);
  return (
    <div style={panelStyle}>
      <DevToolbar>{toolbar(
        <>
          <DevField label="Thuật toán"><select aria-label="Thuật toán" value={option || 'SHA-256'} onChange={(e) => { seqRef.current++; patchContent({ option: e.target.value, output: '', error: null }); }} style={selectStyle}>
            <option value="SHA-256">SHA-256</option><option value="SHA-384">SHA-384</option><option value="SHA-512">SHA-512</option>
          </select></DevField>
          <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} onClick={runHash}>Hash</button>
          <DevField label="Số lượng UUID (1–100)"><input aria-label="Số lượng UUID" value={option2} onChange={(e) => patchContent({ option2: e.target.value })} placeholder="1" style={{ ...toolBtnStyle, width: 56, cursor: 'text' }} /></DevField>
          <button type="button" className="utility-tool-btn" style={toolBtnStyle} onClick={makeUuid}>Tạo UUID</button>
        </>
      )}<span style={{ marginLeft: 'auto', color: error ? 'var(--danger, #d1484f)' : noteStyle.color, fontSize: noteStyle.fontSize }}>{error ? `❌ ${error}` : 'Web Crypto · local'}</span></DevToolbar>
      <DevHelp>Để hash: nhập text vào ô INPUT, chọn thuật toán rồi bấm Hash. Để tạo UUID: nhập số lượng (1–100) vào ô "Số lượng UUID" rồi bấm Tạo UUID — ô này CHỈ là số lượng, không phải nội dung cần hash.</DevHelp>
      <DevPanes inputLabel="INPUT" outputLabel="OUTPUT" input={input} output={output} inputAria="Hash input" outputAria="Hash output" inputPlaceholder="Dán text cần hash..." onInput={onInput} />
      <DevFooter><span>Hash chạy local qua Web Crypto · kết quả cũ bị bỏ khi input đổi</span><span>UUID 1–100</span></DevFooter>
    </div>
  );
}

function JwtPanel({ db, instanceKey }: { db: TaskPlannerDatabase; instanceKey: string }) {
  const [content, patchContent, clearContent] = useUtilityContent('jwt_decoder', instanceKey);
  const { input, output, error } = content;
  const [statusText, setStatusText] = useState('Chưa chạy');
  const run = useCallback(() => {
    const result = decodeJwt(input.trim());
    if (result.error) {
      patchContent({ output: '', error: result.error });
      setStatusText('Token không hợp lệ');
      return;
    }
    patchContent({ output: JSON.stringify({ header: result.header, payload: result.payload }, null, 2), error: null });
    setStatusText(result.expired === null ? 'Không có exp' : result.expired ? 'Hết hạn' : 'Còn hạn');
  }, [input, patchContent]);
  const onInput = useCallback((value: string) => patchContent({ input: value, output: '', error: null }), [patchContent]);
  const toolbar = useCommonToolbar('jwt_decoder', content, patchContent, clearContent, db, undefined, output);
  return (
    <div style={panelStyle}>
      <DevToolbar>{toolbar(
        <button type="button" className="utility-tool-btn primary" style={toolPrimaryBtnStyle} onClick={run}>Chạy</button>
      )}<span style={{ marginLeft: 'auto', color: error ? 'var(--danger, #d1484f)' : noteStyle.color, fontSize: noteStyle.fontSize }}>{error ? `❌ ${error}` : statusText}</span></DevToolbar>

      <div style={{ padding: '6px 14px', background: 'var(--warning-bg, #fff7e6)', color: 'var(--warning, #a56906)', fontSize: 'var(--font-size-small, 12px)', borderBottom: '1px solid var(--border, #e9eaee)' }}>
        ⚠ Chỉ decode — KHÔNG verify chữ ký. Không dùng để xác thực token.
      </div>
      <DevHelp>Dán JWT (3 phần, cách nhau bằng dấu chấm) vào ô TOKEN rồi bấm Chạy để xem header và payload. Signature bị bỏ qua.</DevHelp>
      <DevPanes inputLabel="TOKEN" outputLabel="HEADER + PAYLOAD" input={input} output={output} inputAria="JWT token" outputAria="JWT decoded" inputPlaceholder="Dán JWT vào đây..." onInput={onInput} />
      <DevFooter><span>JWT · decode local, bỏ qua signature</span><span>{statusText}</span></DevFooter>
    </div>
  );
}

export function UtilityToolPanel({
  viewType,
  db = defaultDb,
  instanceKey,
}: {
  viewType: EditorViewType;
  db?: TaskPlannerDatabase;
  instanceKey?: string;
}) {
  const key = instanceKey ?? viewType;
  switch (viewType) {
    case 'json_formatter':
      return <JsonFormatter db={db} instanceKey={key} />;
    case 'xml_formatter':
      return <XmlFormatter db={db} instanceKey={key} />;
    case 'text_compare':
      return <TextCompare db={db} instanceKey={key} />;
    case 'markdown_viewer':
      return <MarkdownViewer db={db} instanceKey={key} />;
    case 'encoder_decoder':
      return <EncoderPanel db={db} instanceKey={key} />;
    case 'regex_tester':
      return <RegexTesterPanel db={db} instanceKey={key} />;
    case 'timestamp_converter':
      return <TimestampPanel db={db} instanceKey={key} />;
    case 'date_calculation':
      return <DateCalcPanel db={db} instanceKey={key} />;
    case 'text_utilities':
      return <TextUtilitiesPanel db={db} instanceKey={key} />;
    case 'cron_expression':
      return <CronPanel db={db} instanceKey={key} />;
    case 'hash_uuid':
      return <HashUuidPanel db={db} instanceKey={key} />;
    case 'jwt_decoder':
      return <JwtPanel db={db} instanceKey={key} />;
    default:
      return null;
  }
}

export function utilityToolIcon(viewType: EditorViewType, size = 13): React.ReactNode {
  const icon = (node: React.ReactNode) => <span style={{ fontSize: size, color: 'var(--accent, #3871e1)' }}>{node}</span>;
  switch (viewType) {
    case 'json_formatter':
      return <span style={{ fontSize: size, color: 'var(--accent, #3871e1)' }}>{'{}'}</span>;
    case 'xml_formatter':
      return icon(<CodeOutlined />);
    case 'text_compare':
      return icon(<DiffOutlined />);
    case 'markdown_viewer':
      return icon(<FileTextOutlined />);
    case 'encoder_decoder':
      return icon(<LinkOutlined />);
    case 'regex_tester':
      return icon(<ExperimentOutlined />);
    case 'timestamp_converter':
      return icon(<ClockCircleOutlined />);
    case 'date_calculation':
      return icon(<CalendarOutlined />);
    case 'text_utilities':
      return icon(<FormatPainterOutlined />);
    case 'cron_expression':
      return icon(<FieldTimeOutlined />);
    case 'hash_uuid':
      return icon(<KeyOutlined />);
    case 'jwt_decoder':
      return icon(<SafetyCertificateOutlined />);
    default:
      return null;
  }
}
