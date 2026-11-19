import React, { useEffect } from 'react';
import { Alert, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { z } from 'zod';
import type { ConfigProfileEnvelopeSchema } from '../../validation/configProfileSchemas';
import {
  getDeclaredProfileSecretFields,
  getMachineSpecificFields,
} from '../../services/configProfiles/catalog';
import { announceToScreenReader } from '../common/AriaLiveRegion';

const { Paragraph, Text } = Typography;

export interface PostProfileImportChecklistProps {
  envelope: z.infer<typeof ConfigProfileEnvelopeSchema>;
  blankSecretFields: string[];
  visible: boolean;
  onClose: () => void;
}

/**
 * Two-group after-import checklist: secrets to re-enter and machine-specific
 * values to review. Both groups come from the catalog so they cannot drift from
 * the profile schema. Telegram is excluded from profile scope by owner decision.
 */
export const PostProfileImportChecklist: React.FC<PostProfileImportChecklistProps> = ({
  envelope,
  blankSecretFields,
  visible,
  onClose,
}) => {
  useEffect(() => {
    if (!visible) return;
    announceToScreenReader(
      'Đã áp dụng profile cấu hình. Vui lòng xem danh sách secret cần nhập lại và giá trị machine-specific cần rà soát.'
    );
  }, [visible, envelope]);

  if (!visible) return null;

  // IN-01: only secrets declared by the profile (plus blank keys actually skipped during
  // apply) are listed; all entries are intersected with the catalog to ignore unknown keys.
  const secrets = Array.from(
    new Set([
      ...getDeclaredProfileSecretFields(envelope.profile.config.secretFields),
      ...getDeclaredProfileSecretFields(
        Object.fromEntries(blankSecretFields.map((field) => [field, '']))
      ),
    ])
  ).filter((field) => !/telegram/i.test(field));

  const machineFields = getMachineSpecificFields().filter((field) => !/telegram/i.test(field));

  return (
    <Alert
      type="warning"
      showIcon
      icon={<WarningOutlined />}
      closable
      onClose={onClose}
      style={{ marginBottom: 16 }}
      message={`Đã áp dụng profile "${envelope.profile.name}" — cần rà soát`}
      description={
        <div>
          <Paragraph style={{ marginBottom: 6 }}>
            Các cài đặt đã được trộn theo từng khóa; cài đặt khác và secret hiện tại của bạn vẫn
            được giữ nguyên.
          </Paragraph>
          <Text strong>Secrets cần nhập lại:</Text>
          <Paragraph type="secondary" style={{ marginBottom: 6 }}>
            Chỉ liệt kê secret được profile khai báo. Các secret khác trong danh mục vẫn cần kiểm
            tra nếu bạn dùng dịch vụ tương ứng.
          </Paragraph>
          <ul data-checklist-group="secrets">
            {secrets.map((field) => (
              <li key={field} data-field={field}>
                <Text code>{field}</Text>
              </li>
            ))}
          </ul>
          <Paragraph type="secondary" style={{ marginBottom: 6 }}>
            Phần mẫu defaults cho đội AI trong tệp profile chỉ để tham khảo: KHÔNG được áp dụng tự
            động, không ghi vào cài đặt và không đổi team hiện hữu. Bạn có thể đọc giá trị trong tệp
            rồi tự quyết định khi cấu hình team.
          </Paragraph>
          <Text strong>Giá trị machine-specific cần rà soát:</Text>
          <ul data-checklist-group="machine-specific">
            {machineFields.map((field) => (
              <li key={field} data-field={field}>
                <Text code>{field}</Text>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
};
