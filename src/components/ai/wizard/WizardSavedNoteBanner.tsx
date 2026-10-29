import React from 'react';
import { Alert } from 'antd';

export interface WizardSavedNoteBannerProps {
  documentId?: string | undefined;
  filename: string;
  noteSaved: boolean;
  downloadInitiated?: boolean | undefined;
  savePickerSaved?: boolean | undefined;
}

export const WizardSavedNoteBanner: React.FC<WizardSavedNoteBannerProps> = ({
  documentId,
  filename,
  noteSaved,
  downloadInitiated = false,
  savePickerSaved = false,
}) => {
  const outcomes = [
    noteSaved ? 'Đã lưu thành tài liệu dự án.' : null,
    savePickerSaved
      ? `Đã lưu tệp ${filename} vào vị trí đã chọn.`
      : downloadInitiated
        ? `Đã bắt đầu tải ${filename}.`
        : null,
  ].filter(Boolean).join(' ');

  if (!outcomes) return null;

  return (
    <Alert
      type="success"
      showIcon
      role="status"
      message={outcomes}
      action={noteSaved && documentId ? <a href={`#/notes?doc=${encodeURIComponent(documentId)}`}>Mở tài liệu</a> : undefined}
    />
  );
};
