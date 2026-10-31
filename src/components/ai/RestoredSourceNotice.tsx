import React from 'react';
import { Alert } from 'antd';

export interface RestoredSourceNoticeProps {
  missingSources: readonly { id: string; title: string }[];
}

export const RestoredSourceNotice: React.FC<RestoredSourceNoticeProps> = ({ missingSources }) => {
  if (missingSources.length === 0) return null;
  return (
    // antd v6 Alert hardcodes role="alert" and drops a passed `role`, so the polite status role
    // has to live on a wrapper for assistive tech to announce it as a status.
    <div role="status" aria-live="polite">
      <Alert
        type="warning"
        showIcon
        message="Không tìm thấy nguồn của workflow đã khôi phục."
        description={`Cần bổ sung hoặc thay thế: ${missingSources.map((source) => source.title).join(', ')}. Không thể chạy bước AI tiếp theo.`}
      />
    </div>
  );
};
