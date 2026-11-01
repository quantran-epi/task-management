import React, { useState } from 'react';
import { Typography, Button, Space, Card, Checkbox, theme, message } from 'antd';
import { CopyOutlined, CheckOutlined, ArrowRightOutlined, CodeOutlined } from '@ant-design/icons';

export interface Step3CodeGuideViewProps {
  crCode?: string;
  onProceedToStep4: () => void;
}

export const Step3CodeGuideView: React.FC<Step3CodeGuideViewProps> = ({
  crCode = 'CR-UNKNOWN',
  onProceedToStep4,
}) => {
  const { token } = theme.useToken();
  const [copied, setCopied] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    diff: false,
    tests: false,
    migration: false,
  });

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

  const handleCheckChange = (key: string, checked: boolean) => {
    setCheckedItems((prev) => ({ ...prev, [key]: checked }));
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
      </Card>

      <Card
        title="Checklist kiểm tra trước khi nạp pack"
        size="small"
        style={{ border: `1px solid ${token.colorBorderSecondary}` }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Checkbox
            checked={checkedItems.diff}
            onChange={(e) => handleCheckChange('diff', e.target.checked)}
          >
            Đã kiểm tra <code>git diff</code> — các thay đổi nằm trong phạm vi giải pháp đã duyệt
          </Checkbox>
          <Checkbox
            checked={checkedItems.tests}
            onChange={(e) => handleCheckChange('tests', e.target.checked)}
          >
            Đã chạy unit test / integration test kiểm tra regression
          </Checkbox>
          <Checkbox
            checked={checkedItems.migration}
            onChange={(e) => handleCheckChange('migration', e.target.checked)}
          >
            Đã chuẩn bị script migration DB và kịch bản rollback (nếu có thay đổi DB)
          </Checkbox>
        </Space>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <Button
          type="primary"
          size="large"
          icon={<ArrowRightOutlined />}
          onClick={onProceedToStep4}
        >
          Đã code xong — Chuyển sang Nạp Change Pack
        </Button>
      </div>
    </div>
  );
};
