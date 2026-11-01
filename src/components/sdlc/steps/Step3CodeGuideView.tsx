import React, { useState } from 'react';
import { Typography, Button, Space, Card, Alert, theme, message } from 'antd';
import { CopyOutlined, CheckOutlined, ArrowRightOutlined, CodeOutlined } from '@ant-design/icons';
import { formatGuardMessage } from '../../../services/wizard/workflowGuards';
import type { SdlcStepId } from '../../../services/wizard/workflowSchemas';

export interface Step3CodeGuideViewProps {
  crCode?: string;
  /** Approved SOLUTION.md body — supplies the scope/acceptance part of the handoff contract. */
  approvedSolutionMarkdown?: string | undefined;
  onProceedToStep4: () => void;
  /** D-20: a navigation CTA back to the step that supplies the missing artifact. */
  onNavigateToStep?: ((step: SdlcStepId) => void) | undefined;
}

const HANDOFF_ITEMS = [
  { key: 'scope', label: 'Phạm vi & tiêu chí nghiệm thu' },
  { key: 'tests', label: 'Kiểm thử bắt buộc' },
  { key: 'migration', label: 'Migration & rollback' },
  { key: 'pack', label: 'Yêu cầu đối với Change Pack' },
] as const;

export const Step3CodeGuideView: React.FC<Step3CodeGuideViewProps> = ({
  crCode = 'CR-UNKNOWN',
  approvedSolutionMarkdown,
  onProceedToStep4,
  onNavigateToStep,
}) => {
  // D-20: the handoff is only meaningful against an approved SOLUTION.
  const hasApprovedSolution = Boolean(approvedSolutionMarkdown?.trim());
  const { token } = theme.useToken();
  const [copied, setCopied] = useState(false);

  const cliCommand = `node scripts/change-pack.mjs --cr ${crCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopied(true);
      message.success('Đã sao chép lệnh đóng gói!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('Không thể sao chép lệnh');
    }
  };

  const contractBody: Record<(typeof HANDOFF_ITEMS)[number]['key'], string> = {
    scope: approvedSolutionMarkdown?.trim() || '(chưa cung cấp)',
    tests:
      'Chạy unit test và kiểm thử hồi quy cho mọi hành vi trong phạm vi đã duyệt; ghi lại kết quả vào Change Pack.',
    migration:
      'Nếu thay đổi schema/DB, kèm script migration và kịch bản rollback tương ứng. Không có thay đổi DB thì ghi rõ "không áp dụng".',
    pack: `Gói .zip phải chứa diff.patch và meta.json; trường cr trong meta.json phải trùng ${crCode}.`,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bước 3: Hướng dẫn Coding ngoài & Đóng gói Change Pack
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
          Thực hiện code trên IDE ngoài (VS Code, Cursor, Claude Code CLI...). Sau khi hoàn tất, chạy lệnh script bên dưới để đóng gói thay đổi vào file `.zip`.
        </Typography.Paragraph>
      </div>

      <Card
        title={
          <Space>
            <CodeOutlined style={{ color: token.colorPrimary }} />
            <span>Lệnh đóng gói Change Pack</span>
          </Space>
        }
        size="small"
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Typography.Paragraph style={{ fontSize: 13, color: token.colorTextSecondary }}>
          Mở terminal tại thư mục gốc dự án của bạn và chạy lệnh sau:
        </Typography.Paragraph>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: token.colorFillTertiary,
            padding: '10px 16px',
            borderRadius: token.borderRadiusSM,
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 600,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <span data-testid="cli-command">{cliCommand}</span>
          <Button
            size="small"
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopy}
          >
            {copied ? 'Đã chép' : 'Sao chép'}
          </Button>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          * Script sẽ tự động scan git diff, tạo file meta.json và nén thành file zip tương ứng với mã CR <code>{crCode}</code>.
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          Lệnh này do lập trình viên chạy trong repository nguồn đích. TaskMate không thực thi lệnh và không truy cập mã nguồn; TaskMate chỉ đọc tệp .zip sau khi bạn nạp lên.
        </Typography.Text>
      </Card>

      <Card
        title="Hợp đồng bàn giao Coding & Change Pack"
        size="small"
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {HANDOFF_ITEMS.map((item) => (
            <div key={item.key}>
              <Typography.Text strong style={{ display: 'block', fontSize: 13 }}>
                {item.label}
              </Typography.Text>
              <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {contractBody[item.key]}
              </Typography.Paragraph>
            </div>
          ))}
        </Space>
      </Card>

      {!hasApprovedSolution && (
        <Alert
          type="error"
          showIcon
          data-testid="step3-prerequisite-guard"
          message={formatGuardMessage('SOLUTION_REQUIRED_FOR_CHANGE_PACK')}
          description="Tài liệu bắt buộc: SOLUTION.md đã được phê duyệt ở Bước 2. Chưa có tài liệu này thì hợp đồng bàn giao và Change Pack không có phạm vi đối chiếu."
          action={
            <Button
              type="primary"
              disabled={!onNavigateToStep}
              onClick={() => onNavigateToStep?.('SOLUTION')}
            >
              Chuyển đến Bước 2: Thiết kế giải pháp
            </Button>
          }
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <Button
          type="primary"
          size="large"
          icon={<ArrowRightOutlined />}
          disabled={!hasApprovedSolution}
          onClick={onProceedToStep4}
        >
          Đã code xong — Chuyển sang Nạp Change Pack
        </Button>
      </div>
    </div>
  );
};
