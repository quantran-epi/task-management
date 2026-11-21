import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Modal, Radio, Segmented, Select, Tooltip, message } from 'antd';
import {
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DiffOutlined,
  FileTextOutlined,
  FormatPainterOutlined,
  MinusOutlined,
  SaveOutlined,
  SwapOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { EditorViewType } from '../store/layoutStore';
import { renderSafeMarkdown } from '../../utils/markdown';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { createNote } from '../../db/repositories/noteRepo';
import { UtilityToolAIAssistant } from './UtilityToolAIAssistant';
import { LineNumberedPane, computeFoldRanges } from './LineNumberedPane';
import { useUtilityContent, type Indent } from './utilityToolContentStore';

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
  gap: 8,
  padding: '9px 14px',
  borderBottom: '1px solid var(--border, #e9eaee)',
  flexWrap: 'wrap',
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
  gap: 14,
  padding: '0 14px',
  background: 'var(--bg-elev, #f7f8fa)',
  borderTop: '1px solid var(--border, #e9eaee)',
  color: 'var(--fg-muted, #6c707e)',
  fontSize: 'var(--font-size-xs, 11px)',
};

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    message.success('Đã copy');
  } catch {
    message.error('Không copy được');
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
  const [kind, setKind] = useState<SaveKind>('download');
  const [extension, setExtension] = useState(formats[0]?.extension ?? '');
  const [name, setDefaultName] = useState(defaultName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setKind('download');
      setExtension(formats[0]?.extension ?? '');
      setDefaultName(defaultName);
    }
  }, [open, defaultName, formats]);

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
      <Radio.Group value={kind} onChange={(e) => setKind(e.target.value)} style={{ marginBottom: 16 }}>
        <Radio value="download">Tải về máy</Radio>
        <Radio value="docs">Lưu vào Docs</Radio>
      </Radio.Group>
      <div style={{ display: 'flex', gap: 8 }}>
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

  const html = error
    ? escapeHtml(`❌ ${error}`)
    : visibleLines.map((i) =>
        highlight(lines[i] ?? '', kind) +
        (collapsedLines.has(i) ? ELLIPSIS_MARKUP : '') +
        (i < lines.length - 1 ? '\n' : '')
      ).join('');

  return (
    <LineNumberedPane
      scrollRef={rightRef}
      totalLines={lines.length}
      visibleLines={visibleLines}
      foldableLines={foldableLines}
      collapsedLines={collapsedLines}
      onToggleFold={(lineIndex) =>
        setFolded((prev) => {
          const next = new Set(prev);
          if (next.has(lineIndex)) next.delete(lineIndex);
          else next.add(lineIndex);
          return next;
        })
      }
    >
      <pre ref={rightRef} onScroll={onRightScroll} aria-label={label} style={{ ...outputStyle, whiteSpace: 'pre' }} dangerouslySetInnerHTML={{ __html: html }} />
    </LineNumberedPane>
  );
}

function JsonFormatter({ db }: { db: TaskPlannerDatabase }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [content, patchContent, clearContent] = useUtilityContent('json_formatter');
  const { input, output, error, formatted, indent } = content;
  const [aiOpen, setAiOpen] = useState(false);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLPreElement>();

  const run = useCallback((minify: boolean) => {
    if (!input.trim()) {
      patchContent({ output: '', error: null });
      return;
    }
    try {
      const value = JSON.parse(input);
      patchContent({ output: JSON.stringify(value, null, minify ? undefined : indentUnit(indent)), formatted: true, error: null });
    } catch (e) {
      patchContent({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [input, indent, patchContent]);

  const onInput = (value: string) => {
    patchContent({ input: value, error: null, formatted: false, ...(!value.trim() ? { output: '' } : {}) });
  };

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <Tooltip title="Format JSON">
          <Button type="primary" icon={<FormatPainterOutlined />} onClick={() => run(false)}>Format</Button>
        </Tooltip>
        <Tooltip title="Minify JSON">
          <Button icon={<MinusOutlined />} onClick={() => run(true)}>Minify</Button>
        </Tooltip>
        <Tooltip title="Copy input">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(input)} />
        </Tooltip>
        <Tooltip title="Copy output">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(output)} />
        </Tooltip>
        <Tooltip title="Clear">
          <Button aria-label="Clear" icon={<DeleteOutlined />} onClick={clearContent} />
        </Tooltip>
        <Select<Indent>
          value={indent}
          onChange={(v) => patchContent({ indent: v })}
          style={{ width: 100 }}
          options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]}
        />
        <Tooltip title="Save as">
          <Button aria-label="Save as" icon={<SaveOutlined />} onClick={() => setSaveOpen(true)}>Save as</Button>
        </Tooltip>
        <Tooltip title="AI · JSON Formatter">
          <Button aria-label="AI · JSON Formatter" icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>AI</Button>
        </Tooltip>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: error ? 'var(--danger, #d1484f)' : 'var(--fg-muted, #6c707e)' }}>
          {error ? `❌ ${error}` : formatted ? '✓ JSON hợp lệ' : input.trim() ? 'Đã thay đổi · bấm Format' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>INPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{input.length} ký tự</span></div>
          <LineNumberedPane scrollRef={leftRef} totalLines={input.split('\n').length}>
            <textarea ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label="JSON input" spellCheck={false} style={editorStyle} value={input} onChange={(e) => onInput(e.target.value)} placeholder={'Dán JSON vào đây, ví dụ: {"name":"TaskMate","ok":true}'} />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>OUTPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>đã format</span></div>
          <FoldingCodeView text={output} kind="json" rightRef={rightRef} onRightScroll={onRightScroll} label="JSON output" error={error} />
        </div>
      </div>
      <div style={footerStyle}><span>JSON · UTF-8</span><span>{output ? output.split('\n').length : 0} dòng</span></div>
      <SaveAsModal
        open={saveOpen}
        defaultName="formatted"
        formats={[{ extension: 'json', content: () => output || input }]}
        db={db}
        onClose={() => setSaveOpen(false)}
      />
      <UtilityToolAIAssistant
        open={aiOpen}
        toolId="json_formatter"
        content={input}
        onApply={(v) => patchContent({ input: v, output: '', error: null, formatted: false })}
        onClose={() => setAiOpen(false)}
        db={db}
      />
    </div>
  );
}

function XmlFormatter({ db }: { db: TaskPlannerDatabase }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [content, patchContent, clearContent] = useUtilityContent('xml_formatter');
  const { input, output, error, formatted, indent } = content;
  const [aiOpen, setAiOpen] = useState(false);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLPreElement>();

  const run = useCallback((minify: boolean) => {
    if (!input.trim()) {
      patchContent({ output: '', error: null });
      return;
    }
    try {
      patchContent({ output: formatXmlString(input, minify ? '' : indent), formatted: true, error: null });
    } catch (e) {
      patchContent({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [input, indent, patchContent]);

  const onInput = (value: string) => {
    patchContent({ input: value, error: null, formatted: false, ...(!value.trim() ? { output: '' } : {}) });
  };

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <Tooltip title="Format XML">
          <Button type="primary" icon={<FormatPainterOutlined />} onClick={() => run(false)}>Format</Button>
        </Tooltip>
        <Tooltip title="Minify XML">
          <Button icon={<MinusOutlined />} onClick={() => run(true)}>Minify</Button>
        </Tooltip>
        <Tooltip title="Copy input">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(input)} />
        </Tooltip>
        <Tooltip title="Copy output">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(output)} />
        </Tooltip>
        <Tooltip title="Clear">
          <Button aria-label="Clear" icon={<DeleteOutlined />} onClick={clearContent} />
        </Tooltip>
        <Select<Indent>
          value={indent}
          onChange={(v) => patchContent({ indent: v })}
          style={{ width: 100 }}
          options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tab' }]}
        />
        <Tooltip title="Save as">
          <Button aria-label="Save as" icon={<SaveOutlined />} onClick={() => setSaveOpen(true)}>Save as</Button>
        </Tooltip>
        <Tooltip title="AI · XML Formatter">
          <Button aria-label="AI · XML Formatter" icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>AI</Button>
        </Tooltip>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: error ? 'var(--danger, #d1484f)' : 'var(--fg-muted, #6c707e)' }}>
          {error ? `❌ ${error}` : formatted ? '✓ XML hợp lệ' : input.trim() ? 'Đã thay đổi · bấm Format' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>INPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{input.length} ký tự</span></div>
          <LineNumberedPane scrollRef={leftRef} totalLines={input.split('\n').length}>
            <textarea ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label="XML input" spellCheck={false} style={editorStyle} value={input} onChange={(e) => onInput(e.target.value)} placeholder={'Dán XML vào đây, ví dụ: <note><to>Quan</to></note>'} />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>OUTPUT <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>đã format</span></div>
          <FoldingCodeView text={output} kind="xml" rightRef={rightRef} onRightScroll={onRightScroll} label="XML output" error={error} />
        </div>
      </div>
      <div style={footerStyle}><span>XML · UTF-8</span><span>{output ? output.split('\n').length : 0} dòng</span></div>
      <SaveAsModal
        open={saveOpen}
        defaultName="formatted"
        formats={[{ extension: 'xml', content: () => output || input }]}
        db={db}
        onClose={() => setSaveOpen(false)}
      />
      <UtilityToolAIAssistant
        open={aiOpen}
        toolId="xml_formatter"
        content={input}
        onApply={(v) => patchContent({ input: v, output: '', error: null, formatted: false })}
        onClose={() => setAiOpen(false)}
        db={db}
      />
    </div>
  );
}

function TextCompare({ db }: { db: TaskPlannerDatabase }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [content, patchContent, clearContent] = useUtilityContent('text_compare');
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
  const countA = mode === 'lines' ? a.split('\n').length : a.split(/\s+/).filter(Boolean).length;
  const countB = mode === 'lines' ? b.split('\n').length : b.split(/\s+/).filter(Boolean).length;
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
        <Tooltip title="Đổi chiều">
          <Button icon={<SwapOutlined />} onClick={() => { setA(b); setB(a); }}>Đổi chiều</Button>
        </Tooltip>
        <Tooltip title="Xóa cả hai">
          <Button aria-label="Clear" icon={<DeleteOutlined />} onClick={clearContent} />
        </Tooltip>
        <Tooltip title="Save as">
          <Button aria-label="Save as" icon={<SaveOutlined />} onClick={() => setSaveOpen(true)}>Save as</Button>
        </Tooltip>
        <Tooltip title="AI · Text Compare">
          <Button aria-label="AI · Text Compare" icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>AI</Button>
        </Tooltip>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: result.changes ? 'var(--warning, #a56906)' : 'var(--success, #338555)' }}>
          {!a.trim() && !b.trim()
            ? 'Dán 2 đoạn text để so sánh'
            : `${result.truncated ? '⚠ Quá lớn · so sánh trực tiếp, ' : ''}${result.changes ? `⚠ ${result.changes} thay đổi` : '✓ Hai đoạn giống hệt'}`}
        </span>
      </div>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>A — GỐC <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{countA} {unit}</span></div>
          <LineNumberedPane scrollRef={leftRef} totalLines={a.split('\n').length}>
            <textarea ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label="Text A" spellCheck={false} style={editorStyle} value={a} onChange={(e) => setA(e.target.value)} placeholder="Text gốc..." />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>B — MỚI <span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--fg-muted)' }}>{countB} {unit}</span></div>
          <LineNumberedPane scrollRef={rightRef} totalLines={b.split('\n').length}>
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
      <SaveAsModal
        open={saveOpen}
        defaultName="comparison"
        formats={[{ extension: 'txt', content: () => b }]}
        db={db}
        onClose={() => setSaveOpen(false)}
      />
      <UtilityToolAIAssistant
        open={aiOpen}
        toolId="text_compare"
        content={b}
        contextContent={a}
        contextLabel="A — GỐC (tham khảo)"
        onApply={setB}
        onClose={() => setAiOpen(false)}
        db={db}
      />
    </div>
  );
}

function MarkdownViewer({ db }: { db: TaskPlannerDatabase }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [content, patchContent, clearContent] = useUtilityContent('markdown_viewer');
  const { source } = content;
  const setSource = (source: string) => patchContent({ source });
  const [aiOpen, setAiOpen] = useState(false);
  const rendered = useMemo(() => renderSafeMarkdown(source), [source]);
  const { leftRef, rightRef, onLeftScroll, onRightScroll } = useSyncedScroll<HTMLTextAreaElement, HTMLDivElement>();

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <Tooltip title="Copy source">
          <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(source)}>Copy</Button>
        </Tooltip>
        <Tooltip title="Clear">
          <Button icon={<DeleteOutlined />} onClick={clearContent}>Clear</Button>
        </Tooltip>
        <Tooltip title="Save as">
          <Button aria-label="Save as" icon={<SaveOutlined />} onClick={() => setSaveOpen(true)}>Save as</Button>
        </Tooltip>
        <Tooltip title="AI · Markdown Viewer">
          <Button aria-label="AI · Markdown Viewer" icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>AI</Button>
        </Tooltip>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-small, 12px)', color: 'var(--fg-muted, #6c707e)' }}>
          {source.length} ký tự · {source.trim() ? 'Đã cập nhật' : 'Sẵn sàng'}
        </span>
      </div>
      <div style={splitPaneStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>SOẠN</div>
          <LineNumberedPane scrollRef={leftRef} totalLines={source.split('\n').length}>
            <textarea ref={leftRef} wrap="off" onScroll={onLeftScroll} aria-label="Markdown editor" spellCheck={false} style={editorStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Dán Markdown vào đây..." />
          </LineNumberedPane>
        </div>
        <PaneDivider />
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, background: 'var(--bg-island, #fff)' }}>
          <div style={colHeadStyle}>XEM TRƯỚC</div>
          <LineNumberedPane scrollRef={rightRef} totalLines={source.split('\n').length}>
            <div ref={rightRef} onScroll={onRightScroll} aria-label="Markdown preview" className="markdown-rendered-view" style={{ ...outputStyle, whiteSpace: 'normal' }} dangerouslySetInnerHTML={{ __html: rendered }} />
          </LineNumberedPane>
        </div>
      </div>
      <div style={footerStyle}><span>Markdown · UTF-8</span><span>{rendered ? 'Đã render' : 'Chưa có nội dung'}</span></div>
      <SaveAsModal
        open={saveOpen}
        defaultName="document"
        formats={[{ extension: 'md', content: () => source }]}
        db={db}
        onClose={() => setSaveOpen(false)}
      />
      <UtilityToolAIAssistant
        open={aiOpen}
        toolId="markdown_viewer"
        content={source}
        onApply={setSource}
        onClose={() => setAiOpen(false)}
        db={db}
      />
    </div>
  );
}

export function UtilityToolPanel({
  viewType,
  db = defaultDb,
}: {
  viewType: EditorViewType;
  db?: TaskPlannerDatabase;
}) {
  switch (viewType) {
    case 'json_formatter':
      return <JsonFormatter db={db} />;
    case 'xml_formatter':
      return <XmlFormatter db={db} />;
    case 'text_compare':
      return <TextCompare db={db} />;
    case 'markdown_viewer':
      return <MarkdownViewer db={db} />;
    default:
      return null;
  }
}

export function utilityToolIcon(viewType: EditorViewType, size = 13): React.ReactNode {
  switch (viewType) {
    case 'json_formatter':
      return <span style={{ fontSize: size, color: 'var(--accent, #3871e1)' }}>{'{}'}</span>;
    case 'xml_formatter':
      return <CodeOutlined style={{ fontSize: size, color: 'var(--accent, #3871e1)' }} />;
    case 'text_compare':
      return <DiffOutlined style={{ fontSize: size, color: 'var(--accent, #3871e1)' }} />;
    case 'markdown_viewer':
      return <FileTextOutlined style={{ fontSize: size, color: 'var(--accent, #3871e1)' }} />;
    default:
      return null;
  }
}
