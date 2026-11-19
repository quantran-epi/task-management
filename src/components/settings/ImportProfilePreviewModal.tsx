import React, { useMemo, useState } from 'react';
import { Modal, Input, Typography, Alert, Table, Tag, Descriptions, Space, notification } from 'antd';
import type { TaskPlannerDatabase } from '../../db';
import {
  validateConfigProfilePayload,
  type ConfigProfileValidationResult,
} from '../../validation/configProfileSchemas';
import type { z } from 'zod';
import type { ConfigProfileEnvelopeSchema } from '../../validation/configProfileSchemas';

export type ValidProfileEnvelope = z.infer<typeof ConfigProfileEnvelopeSchema>;
import {
  getDeclaredProfileMachineFields,
  getDeclaredProfileSecretFields,
} from '../../services/configProfiles/catalog';
import {
  applyConfigProfile,
  type ApplyProfileResult,
} from '../../services/configProfiles/importProfile';
import { announceToScreenReader } from '../common/AriaLiveRegion';
import { PostProfileImportChecklist } from './PostProfileImportChecklist';

const { Text, Paragraph } = Typography;

export interface ImportProfilePreviewModalProps {
  open: boolean;
  parsed: unknown;
  rawFileName: string;
  db: TaskPlannerDatabase;
  onClose: () => void;
  onApplySuccess?: (envelope: ValidProfileEnvelope, result: ApplyProfileResult) => void;
}

interface FieldRow {
  key: string;
  field: string;
}

const errorColumns = [
  {
    title: 'Vị trí',
    dataIndex: 'field',
    key: 'field',
    width: 220,
    render: (value: string) => <Tag color="volcano">{value}</Tag>,
  },
  {
    title: 'Mô tả',
    dataIndex: 'message',
    key: 'message',
  },
];

const fieldColumns = [
  {
    title: 'Field',
    dataIndex: 'field',
    key: 'field',
    render: (value: string) => <Text code>{value}</Text>,
  },
];

/**
 * In-memory preview for an untrusted profile JSON file.
 *
 * Nothing is written during preview. Apply is gated on a valid envelope plus the
 * exact confirm text IMPORT, and uses the explicitly threaded db — never defaultDb.
 */
export const ImportProfilePreviewModal: React.FC<ImportProfilePreviewModalProps> = ({
  open,
  parsed,
  rawFileName,
  db,
  onClose,
  onApplySuccess,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [appliedEnvelope, setAppliedEnvelope] = useState<ValidProfileEnvelope | undefined>(
    undefined
  );
  const [appliedBlankSecrets, setAppliedBlankSecrets] = useState<string[]>([]);

  const validationResult: ConfigProfileValidationResult = useMemo(
    () => validateConfigProfilePayload(parsed),
    [parsed]
  );

  // IN-01: list only secrets the profile actually declares, intersected with the catalog;
  // unrelated catalog secrets may still need checking when those services are in use.
  const secretRows = useMemo<FieldRow[]>(
    () =>
      validationResult.valid
        ? getDeclaredProfileSecretFields(
            validationResult.envelope.profile.config.secretFields
          ).map((field) => ({ key: field, field }))
        : [],
    [validationResult]
  );

  const machineRows = useMemo<FieldRow[]>(
    () =>
      validationResult.valid
        ? getDeclaredProfileMachineFields(validationResult.envelope.profile.config).map((field) => ({
            key: field,
            field,
          }))
        : [],
    [validationResult]
  );

  const fieldCount = validationResult.valid
    ? Object.keys(validationResult.envelope.profile.config.settings).length
    : 0;
  const capacityRuleCount = validationResult.valid
    ? validationResult.envelope.profile.config.capacityRules.length
    : 0;
  const capacityOverrideCount = validationResult.valid
    ? validationResult.envelope.profile.config.capacityOverrides.length
    : 0;
  const conventions = validationResult.valid
    ? String(validationResult.envelope.profile.config.settings.global_conventions ?? '')
    : '';

  const applyDisabled =
    !validationResult.valid || confirmText !== 'IMPORT' || loading || appliedEnvelope !== undefined;

  const handleApply = async () => {
    if (applyDisabled || !validationResult.valid || !validationResult.envelope) return;
    setLoading(true);
    try {
      const result = await applyConfigProfile(validationResult.envelope, db);
      if (!result.applied) {
        notification.error({
          message: 'Profile không hợp lệ',
          description: result.errors.map((error) => error.message).join('; '),
        });
        return;
      }
      announceToScreenReader(
        `Đã áp dụng profile ${validationResult.envelope.profile.name}. Vui lòng rà soát danh sách-field phía sau.`
      );
      notification.success({
        message: 'Áp dụng profile thành công',
        description: `Đã trộn ${result.appliedSettingKeys.length} cài đặt theo từng khóa. Các cài đặt khác và secret hiện tại của bạn không bị thay đổi.`,
        duration: 5,
      });
      setAppliedEnvelope(validationResult.envelope);
      setAppliedBlankSecrets(result.skippedBlankSecrets);
      setConfirmText('');
      onApplySuccess?.(validationResult.envelope, result);
    } catch (error) {
      notification.error({
        message: 'Lỗi áp dụng profile',
        description: error instanceof Error ? error.message : 'Đã có lỗi xảy ra.',
      });
    } finally {
      setLoading(false);
    }
  };

  const closeAndReset = () => {
    setConfirmText('');
    setAppliedEnvelope(undefined);
    setAppliedBlankSecrets([]);
    onClose();
  };

  return (
    <>
      <Modal
        title="Xem trước & Xác nhận nhập Profile"
        open={open}
        width={760}
        onCancel={closeAndReset}
        onOk={() => void handleApply()}
        okText="Xác nhận nhập Profile"
        cancelText="Hủy"
        okButtonProps={{ disabled: applyDisabled, loading }}
        maskClosable={!loading}
        closable={!loading}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="Tên tệp">{rawFileName}</Descriptions.Item>
            <Descriptions.Item label="Tên profile">
              {validationResult.valid ? validationResult.envelope.profile.name : 'N/A'}
            </Descriptions.Item>
            <Descriptions.Item label="Phiên bản profile">
              {validationResult.valid
                ? validationResult.envelope.profileSchemaVersion
                : 'N/A'}
            </Descriptions.Item>
            <Descriptions.Item label="Số field cài đặt">
              {validationResult.valid ? fieldCount : 'N/A'}
            </Descriptions.Item>
            <Descriptions.Item label="Quy tắc công suất">
              {validationResult.valid ? capacityRuleCount : 'N/A'}
            </Descriptions.Item>
            <Descriptions.Item label="Ngoại lệ công suất">
              {validationResult.valid ? capacityOverrideCount : 'N/A'}
            </Descriptions.Item>
          </Descriptions>

          {!validationResult.valid ? (
            <div>
              <Alert
                type="error"
                showIcon
                message="Tệp profile không hợp lệ"
                description="Dữ liệu hiện tại trong máy hoàn toàn an toàn và không bị thay đổi. Không có bản ghi nào được ghi."
                style={{ marginBottom: 12 }}
              />
              <Table
                size="small"
                dataSource={validationResult.errors.map((error, index) => ({ ...error, key: index }))}
                columns={errorColumns}
                pagination={{ pageSize: 5 }}
              />
            </div>
          ) : (
            <>
              <Alert
                type="warning"
                showIcon
                message="Rà soát trước khi áp dụng"
                description={
                  <div>
                    <Paragraph style={{ marginBottom: 6 }}>
                      Đây là phép trộn theo từng khóa: các cài đặt không có trong profile và secret
                      hiện tại của bạn được giữ nguyên.
                    </Paragraph>
                    <Text strong>Secrets cần nhập lại sau khi áp dụng:</Text>
                    <Paragraph type="secondary" style={{ marginBottom: 6 }}>
                      Chỉ liệt kê secret được profile khai báo. Các secret khác trong danh mục vẫn
                      cần kiểm tra nếu bạn dùng dịch vụ tương ứng.
                    </Paragraph>
                    <ul data-preview-group="secrets">
                      {secretRows.map((row) => (
                        <li key={row.key} data-field={row.field}>
                          <Text code>{row.field}</Text>
                        </li>
                      ))}
                    </ul>
                    <Text strong>Giá trị machine-specific cần rà soát:</Text>
                    <Paragraph type="secondary" style={{ marginBottom: 6 }}>
                      Các field khác chỉ cần kiểm tra nếu bạn dùng dịch vụ tương ứng.
                    </Paragraph>
                    <ul data-preview-group="machine-specific">
                      {machineRows.map((row) => (
                        <li key={row.key} data-field={row.field}>
                          <Text code>{row.field}</Text>
                        </li>
                      ))}
                    </ul>
                  </div>
                }
              />

              {conventions && (
                <div data-preview-field="global_conventions">
                  <Text strong>Quy ước chung trong profile (dữ liệu chỉ đọc):</Text>
                  <Paragraph ellipsis={{ rows: 3, expandable: true }}>
                    {conventions}
                  </Paragraph>
                </div>
              )}

              <Table
                size="small"
                dataSource={machineRows}
                columns={fieldColumns}
                pagination={false}
                title={() => 'Field machine-specific (giữ nguyên giá trị, cần kiểm tra)'}
              />

              <div>
                <Paragraph>
                  Nhập chính xác <Text code strong>IMPORT</Text> để mở khóa nút xác nhận:
                </Paragraph>
                <Input
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                  placeholder="IMPORT"
                  aria-label="Xác nhận từ khóa IMPORT"
                />
              </div>
            </>
          )}
        </Space>
      </Modal>

      {appliedEnvelope && (
        <PostProfileImportChecklist
          envelope={appliedEnvelope}
          blankSecretFields={appliedBlankSecrets}
          visible={appliedEnvelope !== undefined}
          onClose={() => setAppliedEnvelope(undefined)}
        />
      )}
    </>
  );
};
