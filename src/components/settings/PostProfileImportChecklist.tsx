import React, { useEffect } from 'react';
import { Alert, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { z } from 'zod';
import type { ConfigProfileEnvelopeSchema } from '../../validation/configProfileSchemas';
import { getMachineSpecificFields, getSecretFields } from '../../services/configProfiles/catalog';
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

  // Every catalog secret arrives blank by design; the applied result's skipped-secret
  // list is merged in so the checklist also covers secrets found in the file.
  const secrets = Array.from(
    new Set([...getSecretFields(), ...blankSecretFields, ...Object.keys(envelope.profile.config.secretFields)])
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
          <ul data-checklist-group="secrets">
            {secrets.map((field) => (
              <li key={field} data-field={field}>
                <Text code>{field}</Text>
              </li>
            ))}
          </ul>
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
