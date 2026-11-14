import React from 'react';
import { Alert, Button, Collapse, Tooltip, theme } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DiffOutlined } from '@ant-design/icons';
import type { ArtifactPatchProposal } from '../../../services/ai/patchProposal';

export interface PatchDiffApprovalCardProps {
  patch: ArtifactPatchProposal;
  stale?: boolean | undefined;
  applying?: boolean | undefined;
  error?: string | undefined;
  decision?: 'approved' | 'rejected' | undefined;
  /** D-24: the skill proposal reuses this card; the default keeps the note surface byte-identical. */
  variant?: 'patch' | 'skill' | undefined;
  /** Replaces the `{target} · {id} · mục {sectionId}` line — the skill path must never print a UUID. */
  subtitle?: string | undefined;
  /** Model-authored, display-only. Rendered as plain text, never as markup. */
  evidence?: string | undefined;
  staleReason?: 'document-changed' | 'newer-version-approved' | undefined;
  onApprove: () => void;
  onReject: () => void;
}

const STALE_COPY = {
  'document-changed':
    'Tài liệu đã thay đổi sau khi đề xuất này. Bản diff bên dưới chỉ để tham khảo — yêu cầu AI đề xuất lại trong khung chat.',
  'newer-version-approved':
    'Kỹ năng đã có bản mới được duyệt sau khi đề xuất này được tạo. Bản diff bên dưới chỉ để tham khảo — yêu cầu nhân viên đề xuất lại trong khung chat.',
} as const;

const STALE_BLOCKED_COPY = {
  'document-changed': 'Không thể áp dụng vì tài liệu đã thay đổi',
  'newer-version-approved': 'Không thể duyệt vì kỹ năng đã có bản mới hơn',
} as const;

/** WR-03: antd 6 darkAlgorithm uses a #000 background with #fff text. */
export function isDarkBase(colorBgBase?: string | undefined): boolean {
  if (!colorBgBase) return false;
  const value = colorBgBase.trim().toLowerCase();
  if (value === '#141414' || value === '#000' || value === '#000000') return true;
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3]) < 96;
  return false;
}

export const PatchDiffApprovalCard: React.FC<PatchDiffApprovalCardProps> = ({
  patch, stale = false, applying = false, error, decision,
  variant = 'patch', subtitle, evidence, staleReason = 'document-changed',
  onApprove, onReject,
}) => {
  const { token } = theme.useToken();
  const dark = isDarkBase(token.colorBgBase);
  const addBg = dark ? '#23452b' : '#e6ffed';
  const delBg = dark ? '#4d1f24' : '#ffeef0';
  const lines = patch.diffText.split(/(?<=\n)/);
  const subtitleText = subtitle ?? `${patch.target === 'note' ? 'Ghi chú' : 'Kỹ năng'} · ${patch.id} · mục ${patch.sectionId}`;
  const staleBlockedCopy = STALE_BLOCKED_COPY[staleReason];
  return (
    <section data-testid="patch-diff-approval" aria-label={`Đề xuất chỉnh sửa: ${patch.sectionTitle}`}
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, maxWidth: '100%',
        borderRadius: 8, margin: '8px 0 16px', color: token.colorText,
        backgroundColor: stale ? token.colorWarningBg : token.colorBgContainer,
        border: `1px solid ${stale ? token.colorWarningBorder : token.colorBorderSecondary}` }}>
      <div style={{ display: 'flex', gap: 8, minWidth: 0, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
        <DiffOutlined style={{ color: token.colorPrimary, flexShrink: 0 }} />
        <span title={patch.sectionTitle} style={{ minWidth: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Đề xuất chỉnh sửa: {patch.sectionTitle}
        </span>
      </div>
      <div title={subtitleText}
        style={{ fontSize: 12, color: token.colorTextSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {subtitleText}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* non-color signals: explicit +/− prefixes and text counts */}
        <span style={{ backgroundColor: addBg, padding: '2px 8px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap' }}>+{patch.addedLines} dòng thêm</span>
        <span style={{ backgroundColor: delBg, padding: '2px 8px', borderRadius: 8, fontSize: 12, whiteSpace: 'nowrap' }}>−{patch.removedLines} dòng xóa</span>
      </div>
      {stale && <Alert type="warning" showIcon role="alert" style={{ fontSize: 12 }}
        title={STALE_COPY[staleReason]} />}
      {error && <Alert type="error" showIcon role="alert" style={{ fontSize: 12 }} title={error} />}
      <div role="region" aria-label="Diff đề xuất chỉnh sửa" tabIndex={0}
        onFocus={(event) => { event.currentTarget.style.outline = `2px solid ${token.colorPrimary}`; }}
        onBlur={(event) => { event.currentTarget.style.outline = ''; }}
        style={{ maxHeight: 240, overflowX: 'auto', overflowY: 'auto', minWidth: 0, whiteSpace: 'pre',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 12, lineHeight: '20px' }}>
        {/* WR-04: block-level rows so a line background spans the diff width, not just its glyphs. */}
        {lines.map((line, index) => (
          <span key={index} data-diff-line style={{ display: 'block', width: '100%',
            backgroundColor: line.startsWith('+') && !line.startsWith('+++') ? addBg :
              line.startsWith('-') && !line.startsWith('---') ? delBg : 'transparent' }}>{line}</span>
        ))}
      </div>
      {decision ? <div role="status" style={{ fontSize: 12 }}>
        {decision === 'approved'
          ? <><CheckCircleOutlined style={{ color: token.colorSuccess }} /> {variant === 'skill'
            ? 'Đã chấp thuận — kỹ năng đã cập nhật sang bản mới.'
            : 'Đã chấp thuận — bản nháp bước này đã được cập nhật.'}</>
          : <><CloseCircleOutlined style={{ color: token.colorTextSecondary }} /> {variant === 'skill'
            ? 'Đã từ chối đề xuất — kỹ năng không thay đổi.'
            : 'Đã từ chối đề xuất — tài liệu không thay đổi.'}</>}
      </div> : <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <Button danger disabled={applying} onClick={onReject} style={{ minHeight: 32, fontSize: 12 }}>Từ chối</Button>
        <Tooltip title={stale ? staleBlockedCopy : undefined}>
          <span tabIndex={stale ? 0 : undefined} aria-label={stale ? staleBlockedCopy : undefined}>
            <Button type="primary" disabled={stale || applying} onClick={onApprove}
              style={{ minHeight: 32, fontSize: 12 }}>Chấp thuận</Button>
          </span>
        </Tooltip>
      </div>}
      {/* UAT: the decision buttons come first in document order. The evidence panel is
          supplementary, so keeping it above them pushed Chấp thuận/Từ chối down the page on
          every proposal that carried evidence. */}
      {evidence !== undefined && evidence.trim() !== '' && (
        <Collapse size="small" items={[{
          key: 'evidence',
          label: 'Bằng chứng',
          children: (
            <div style={{ maxHeight: 160, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.5, color: token.colorTextSecondary }}>
              {evidence}
            </div>
          ),
        }]} />
      )}
    </section>
  );
};
