import { Alert, Checkbox, Table, Typography } from 'antd';
import type { DlpFinding } from '../../types/dlp';
import { DLP_RULESET_VERSION } from '../../types/dlp';

const { Text, Title } = Typography;

export interface DlpWarningPanelProps {
  findings: readonly DlpFinding[];
  documentTitles?: Readonly<Record<string, string>>;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
}

export function DlpWarningPanel({ findings, documentTitles = {}, confirmed, onConfirmedChange }: DlpWarningPanelProps) {
  return (
    <section aria-labelledby="dlp-warning-heading">
      <Alert
        type="warning"
        showIcon
        message={<Title level={3} id="dlp-warning-heading">Phát hiện dữ liệu có thể nhạy cảm</Title>}
        description="Kiểm tra các giá trị đã được che trước khi tiếp tục. Xác nhận này chỉ áp dụng cho lần xuất bản hiện tại."
      />
      <Text type="secondary">Bộ quy tắc: {DLP_RULESET_VERSION}</Text>
      <Table
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={[...findings]}
        title={() => <span className="sr-only">Phát hiện dữ liệu nhạy cảm đã che</span>}
        columns={[
          { title: 'Loại', dataIndex: 'category' },
          { title: 'Tài liệu', render: (_, finding) => documentTitles[finding.documentId ?? ''] ?? 'Tên bộ tài liệu' },
          { title: 'Vị trí', render: (_, finding) => `Dòng ${finding.line}, cột ${finding.column}` },
          { title: 'Ngữ cảnh đã che', dataIndex: 'maskedContext', render: (value: string) => <Text code>{value}</Text> },
        ]}
      />
      <Checkbox checked={confirmed} onChange={(event) => onConfirmedChange(event.target.checked)}>
        Tôi đã xem cảnh báo và vẫn muốn xuất bản lần này.
      </Checkbox>
    </section>
  );
}
