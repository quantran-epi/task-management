import React from 'react';
import { Alert, Button, Space, theme } from 'antd';
import type { ChangePackManifest, ChangePackValidationCode } from '../../../services/wizard/changePack';

export type ChangePackUiResult =
  | { status: 'valid'; manifest: Readonly<ChangePackManifest> }
  | { status: 'invalid'; code: ChangePackValidationCode };

export interface ChangePackConfirmStripProps {
  result: ChangePackUiResult;
  onConfirm: (manifest: Readonly<ChangePackManifest>) => void;
  onReplace: () => void;
}

const ERROR_COPY: Readonly<Record<ChangePackValidationCode, string>> = {
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

export const ChangePackConfirmStrip: React.FC<ChangePackConfirmStripProps> = ({ result, onConfirm, onReplace }) => {
  const { token } = theme.useToken();

  if (result.status === 'invalid') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Alert type="error" showIcon message={ERROR_COPY[result.code]} />
        <Button onClick={onReplace} style={{ alignSelf: 'flex-start' }}>Chọn pack khác</Button>
      </div>
    );
  }

  const { manifest } = result;
  return (
    <div
      style={{
        alignItems: 'center',
        background: token.colorFillTertiary,
        borderRadius: token.borderRadius,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'space-between',
        padding: 16,
      }}
    >
      <span style={{ color: token.colorText, fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
        CR {manifest.identity.cr} · Nhánh {manifest.identity.branch} · {manifest.commitCount} commit · {manifest.fileCount} tệp
      </span>
      <Space size={8}>
        <Button type="primary" onClick={() => onConfirm(manifest)}>Xác nhận pack</Button>
        <Button onClick={onReplace}>Chọn pack khác</Button>
      </Space>
    </div>
  );
};
