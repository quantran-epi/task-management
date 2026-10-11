import React from 'react';
import { Alert, Button } from 'antd';

export type GroundedBannerVariant =
  | 'local'
  | 'degraded'
  | 'conflict'
  | 'snapshot-mismatch'
  | 'auth-error'
  | 'invalid-response'
  | 'config-error'
  | 'model-unavailable'
  | 'invalid-grounded-output';

export interface GroundedBannerProps {
  variant: GroundedBannerVariant;
  modalities?: string | undefined;
  dimension?: string | undefined;
  repairCta?: {
    label: string;
    onClick: () => void;
  } | undefined;
}

/**
 * GroundedBanner maps outcome states to Ant Design Alert with UI-SPEC copy.
 * Snapshot-mismatch + conflict use role="alert" (UI-SPEC Accessibility).
 */
export const GroundedBanner: React.FC<GroundedBannerProps> = ({
  variant,
  modalities,
  dimension = 'Unknown',
  repairCta,
}) => {
  let type: 'warning' | 'error' | 'info' = 'warning';
  let message = '';
  let description: React.ReactNode = null;
  let isAlertRole = false;

  switch (variant) {
    case 'local':
      type = 'warning';
      message = 'Đang dùng tìm kiếm cục bộ (BM25)';
      description =
        'Máy chủ tri thức không khả dụng. Chỉ tìm từ khoá trên Markdown đã lập chỉ mục cục bộ. Không có đồ thị hoặc tìm kiếm ngữ nghĩa.';
      break;

    case 'degraded':
      type = 'warning';
      message = 'Kết quả thiếu một phần phương thức';
      description = `${
        modalities || 'Một số phương thức'
      } tạm thời không khả dụng. Trả lời dựa trên bằng chứng còn lại; phạm vi có thể chưa đầy đủ.`;
      break;

    case 'conflict':
      type = 'error';
      message = `Các nguồn mâu thuẫn (${dimension}). Vui lòng tự xác minh trước khi dùng.`;
      description = null;
      isAlertRole = true;
      break;

    case 'snapshot-mismatch':
      type = 'error';
      message =
        'Nội dung cục bộ khác với bản chụp đã trích dẫn. Hiển thị tài liệu hiện tại; không khẳng định giống bản gốc.';
      description = null;
      isAlertRole = true;
      break;

    case 'auth-error':
      type = 'error';
      message = 'Token máy chủ tri thức không hợp lệ. Mở Cài đặt để cập nhật.';
      description = null;
      break;

    case 'invalid-response':
      type = 'error';
      message =
        'Máy chủ tri thức trả về dữ liệu không hợp lệ. Không hợp nhất với kết quả cục bộ.';
      description = null;
      break;

    case 'config-error':
      type = 'error';
      message = 'Cấu hình máy chủ tri thức không hợp lệ. Vui lòng kiểm tra lại thiết lập.';
      description = null;
      break;

    case 'model-unavailable':
      type = 'warning';
      message = 'Mô hình ngôn ngữ hiện không khả dụng.';
      description = 'Bạn có thể xem các nguồn và đường dẫn đã tìm thấy bên dưới.';
      break;

    case 'invalid-grounded-output':
      type = 'error';
      message = 'Kết quả tổng hợp không khớp với bằng chứng xác thực.';
      description = 'Đã khôi phục trạng thái an toàn. Bạn có thể thử lại.';
      break;
  }

  const actionNode = repairCta ? (
    <Button size="small" type="primary" onClick={repairCta.onClick}>
      {repairCta.label}
    </Button>
  ) : undefined;

  return (
    <div
      style={{ marginBottom: 12 }}
      {...(isAlertRole ? { role: 'alert' } : {})}
    >
      <Alert
        message={message}
        description={description}
        type={type}
        showIcon
        action={actionNode}
      />
    </div>
  );
};
