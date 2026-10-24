import React from 'react';
import { Tag, Tooltip, theme } from 'antd';

/**
 * Fixed enum → Vietnamese explanation map (24-UI-SPEC Copywriting Contract).
 * Server free text is never rendered; unknown codes fall back to the raw code
 * plus a generic explanation (D-20, T-24-12).
 */
export const REASON_CODE_EXPLANATIONS: Readonly<Record<string, string>> = {
  SEED_FOUND_NO_RELATION:
    'Đã tìm thấy thực thể nhưng không có quan hệ nào khớp với câu hỏi.',
  INVALID_RELATION: 'Quan hệ được đề xuất không nằm trong bộ quan hệ cho phép.',
  INVALID_DIRECTION: 'Chiều quan hệ không hợp lệ với loại thực thể này.',
  INVALID_ENDPOINT_KIND: 'Loại thực thể đầu cuối không khớp với quan hệ.',
  HOP_LIMIT_EXCEEDED: 'Độ sâu truy vấn vượt giới hạn 3 bước. Đã dùng phạm vi an toàn.',
  SEED_NOT_FOUND: 'Không tìm thấy thực thể được nhắc đến trong bản chụp đã xuất bản.',
  PLAN_REJECTED: 'Kế hoạch truy vấn không hợp lệ và không sửa được. Đã dùng phạm vi an toàn một bước.',
  FALLBACK_ONE_HOP: 'Đang dùng phạm vi liên hệ an toàn một bước.',
  NO_GRAPH_SEED: 'Không xác định được thực thể nào từ câu hỏi để truy vấn đồ thị.',
  RESULT_LIMIT_REACHED: 'Kết quả đồ thị đã bị giới hạn theo số lượng tối đa.',
  PLANNER_SCHEMA_FAILURE: 'Bộ lập kế hoạch trả về định dạng không hợp lệ.',
  PINNED_SNAPSHOT_UNAVAILABLE: 'Không có bản chụp tri thức đang hoạt động.',
  TIMEOUT: 'Bước truy xuất vượt thời gian cho phép.',
  UNCONFIGURED: 'Máy chủ tri thức chưa được cấu hình.',
  PROVIDER_ERROR: 'Nhà cung cấp mô hình trả về lỗi.',
  MODEL_INDEX_MISMATCH: 'Chỉ mục tri thức không khớp với mô hình đang dùng.',
  MISSING_SUPPORTING_CHUNK: 'Thiếu đoạn văn bản hỗ trợ cho quan hệ đã đề xuất.',
};

export const UNKNOWN_REASON_EXPLANATION = 'Không có mô tả cho mã này.';

export interface ReasonCodeChipProps {
  code: string;
}

export const ReasonCodeChip: React.FC<ReasonCodeChipProps> = ({ code }) => {
  const { token } = theme.useToken();
  const explanation = REASON_CODE_EXPLANATIONS[code] ?? UNKNOWN_REASON_EXPLANATION;
  const isFallbackOrLimit =
    code === 'FALLBACK_ONE_HOP' || code === 'RESULT_LIMIT_REACHED';

  return (
    <Tooltip title={explanation}>
      <Tag
        className="reason-code-chip"
        aria-label={`${code}: ${explanation}`}
        color={isFallbackOrLimit ? 'warning' : 'default'}
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: '17px',
          color: token.colorText,
        }}
      >
        {code}
      </Tag>
    </Tooltip>
  );
};
