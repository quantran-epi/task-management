import React from 'react';
import { Alert } from 'antd';

export interface RestoredSourceNoticeProps {
  missingSources: readonly { id: string; title: string }[];
}

export const RestoredSourceNotice: React.FC<RestoredSourceNoticeProps> = ({ missingSources }) => {
  if (missingSources.length === 0) return null;
  return (
    <Alert
      type="warning"
      showIcon
      role="status"
      message="Không tìm thấy nguồn của workflow đã khôi phục."
      description={`Cần bổ sung hoặc thay thế: ${missingSources.map((source) => source.title).join(', ')}. Không thể chạy bước AI tiếp theo.`}
    />
  );
};
