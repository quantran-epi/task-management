import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Space, theme } from 'antd';
import type { ChangePackManifest, ChangePackValidationCode } from '../../../services/wizard/changePack';

export type ChangePackUiResult =
  | { status: 'valid'; manifest: Readonly<ChangePackManifest> }
  | { status: 'invalid'; code: ChangePackValidationCode };

export interface ChangePackConfirmStripProps {
  result: ChangePackUiResult;
  onConfirm: (manifest: Readonly<ChangePackManifest>) => void;
  onReplace: () => void;
  confirming?: boolean;
  disabled?: boolean;
  /** Focus target after the dropzone leaves the DOM. */
  confirmButtonRef?: React.Ref<HTMLButtonElement>;
  replaceButtonRef?: React.Ref<HTMLButtonElement>;
}

export const ERROR_COPY: Readonly<Record<ChangePackValidationCode, string>> = {
  PACK_COMPRESSED_TOO_LARGE: 'Change-pack vượt quá 5MB. Chạy lại scripts/change-pack.mjs với phạm vi nhỏ hơn rồi nạp lại.',
  PACK_ENTRY_PROHIBITED: 'Change-pack chứa tệp không được phép. Loại bỏ node_modules/, *.min.js và package-lock.json rồi nạp lại.',
  PACK_META_INVALID: 'Không đọc được meta.json trong change-pack. Kiểm tra lệnh sinh pack và nạp lại.',
  PACK_CORRUPT: 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.',
  PACK_PATH_UNSAFE: 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.',
  PACK_PATH_COLLISION: 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.',
  PACK_ENTRY_UNSUPPORTED: 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.',
  PACK_REQUIRED_ENTRY_MISSING: 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.',
  PACK_IDENTITY_MISMATCH: 'Thông tin CR hoặc nhánh trong change-pack không khớp phiên hiện tại. Chọn đúng pack rồi nạp lại.',
  PACK_TOO_MANY_ENTRIES: 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.',
  PACK_ENTRY_TOO_LARGE: 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.',
  PACK_EXPANDED_TOO_LARGE: 'Change-pack không hợp lệ hoặc không an toàn. Kiểm tra lệnh sinh pack và nạp lại.',
};

export const ChangePackConfirmStrip: React.FC<ChangePackConfirmStripProps> = ({
  result,
  onConfirm,
  onReplace,
  confirming = false,
  disabled = false,
  confirmButtonRef,
  replaceButtonRef,
}) => {
  const { token } = theme.useToken();
  const rootRef = useRef<HTMLDivElement>(null);
  // Narrow mode is the safe direction: unknown width stacks full-width rather than squeezing.
  const [narrow, setNarrow] = useState(
    () => typeof ResizeObserver === 'undefined',
  );

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? element.clientWidth;
      setNarrow(width < 384);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (result.status === 'invalid') {
    return (
      <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Alert type="error" showIcon message={ERROR_COPY[result.code]} />
        <Button onClick={onReplace} ref={replaceButtonRef} disabled={disabled} style={{ alignSelf: narrow ? 'stretch' : 'flex-start' }}>Chọn pack khác</Button>
      </div>
    );
  }

  const { manifest } = result;
  const actions = (
    <>
      <Button
        ref={confirmButtonRef}
        type="primary"
        loading={confirming}
        disabled={confirming || disabled}
        onClick={() => onConfirm(manifest)}
        style={narrow ? { width: '100%' } : undefined}
      >
        Xác nhận pack
      </Button>
      <Button
        disabled={confirming || disabled}
        onClick={onReplace}
        style={narrow ? { width: '100%' } : undefined}
      >
        Chọn pack khác
      </Button>
    </>
  );

  return (
    <div
      ref={rootRef}
      style={{
        alignItems: narrow ? 'stretch' : 'center',
        background: token.colorFillTertiary,
        borderRadius: token.borderRadius,
        display: 'flex',
        flexDirection: narrow ? 'column' : 'row',
        flexWrap: narrow ? 'nowrap' : 'wrap',
        gap: 8,
        justifyContent: 'space-between',
        padding: 16,
      }}
    >
      <span style={{ color: token.colorText, fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
        CR {manifest.identity.cr} · Nhánh {manifest.identity.branch} · {manifest.commitCount} commit · {manifest.fileCount} tệp
      </span>
      {narrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', width: '100%' }}>{actions}</div>
      ) : (
        <Space size={8}>{actions}</Space>
      )}
    </div>
  );
};
