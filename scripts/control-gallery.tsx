import React from 'react';
import dayjs from 'dayjs';
import { createRoot } from 'react-dom/client';
import { Alert, Avatar, AvatarGroup, Badge, Breadcrumb, Button, Checkbox, Divider, IconButton, Input, InputPassword, InputSearch, DatePicker, DateRangePicker, TimePicker, TimeRangePicker, Pagination, Progress, Select, Radio, RadioGroup, Result, Segmented, Skeleton, Spin, Statistic, Switch, Tag, CheckableTag, Textarea, SettingOutlined, SyncOutlined } from '../src/components/ui';
import '../src/components/ui/openidea/tokens.css';
import './control-gallery.css';
import '../src/components/ui/openidea/global.css';

function ButtonFixture() {
  const [pressed, setPressed] = React.useState(false);
  return (
    <>
      <Button variant="primary">Primary</Button>
      <Button>Secondary</Button>
      <Button type="text">Ghost</Button>
      <Button size="small">Small</Button>
      <Button disabled>Disabled</Button>
      <Button loading aria-label="Loading">Loading</Button>
      <Button aria-pressed={pressed} onClick={() => setPressed(!pressed)}>Selected</Button>
      <IconButton aria-label="Settings" icon={<SettingOutlined />} />
      <IconButton aria-label="Refreshing" loading icon={<SyncOutlined />} />
      <IconButton aria-label="Small settings" size="small" icon={<SettingOutlined />} />
      <Button loading aria-label="Loading label">Lưu thay đổi</Button>
    </>
  );
}

function InputFixture() {
  const [value, setValue] = React.useState('TaskMate');
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
      <label>Tên task<Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Nhập tên task" /></label>
      <label>Không hợp lệ<Input defaultValue="Lỗi" aria-invalid status="error" readOnly /></label>
      <label>Vô hiệu hoá<Input defaultValue="Không sửa" disabled /></label>
      <label>Tìm kiếm<InputSearch placeholder="Tìm nhiệm vụ..." defaultValue="" allowClear onSearch={(v) => console.log('search', v)} /></label>
      <label>Mật khẩu<InputPassword defaultValue="secret" readOnly /></label>
    </div>
  );
}

function TextareaFixture() {
  const [value, setValue] = React.useState('Ghi chú\nDòng thứ hai');
  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
      <label>Ghi chú<Textarea value={value} onChange={(e) => setValue(e.target.value)} /></label>
      <label>Không hợp lệ<Textarea defaultValue="Lỗi" aria-invalid status="error" /></label>
      <label>Vô hiệu hoá<Textarea defaultValue="Không sửa" disabled /></label>
    </div>
  );
}

function CheckboxFixture() {
  const [checked, setChecked] = React.useState(true);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)}>Cho phép gửi thông báo</Checkbox>
      <Checkbox checked={false} readOnly>Không chọn</Checkbox>
      <Checkbox checked disabled>Vô hiệu hoá</Checkbox>
    </div>
  );
}

function RadioFixture() {
  const [value, setValue] = React.useState('plan');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <RadioGroup value={value} onChange={(e) => setValue(e.target.value)}>
        <Radio value="plan">Plan</Radio>
        <Radio value="actual">Actual</Radio>
      </RadioGroup>
      <RadioGroup value="off" disabled>
        <Radio value="off">Disabled</Radio>
      </RadioGroup>
    </div>
  );
}

function SwitchFixture() {
  const [on, setOn] = React.useState(true);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Switch checked={on} onChange={setOn} aria-label="Bật tính năng" />
      <Switch checked={false} disabled aria-label="Vô hiệu hoá" />
    </div>
  );
}

function TimePickerFixture() {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <label>Giờ<TimePicker defaultValue={dayjs('2026-01-01T09:30')} /></label>
      <label>Khoảng giờ<TimeRangePicker defaultValue={[dayjs('2026-01-01T09:00'), dayjs('2026-01-01T17:00')]} /></label>
    </div>
  );
}

function DatePickerFixture() {
  const [value, setValue] = React.useState<import('dayjs').Dayjs | null>(null);
  const [range, setRange] = React.useState<[import('dayjs').Dayjs | null, import('dayjs').Dayjs | null] | null>(null);
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 320 }}>
      <label>Ngày<DatePicker value={value} onChange={(v) => setValue(v)} /></label>
      <label>Khoảng ngày<DateRangePicker value={range} onChange={(v) => setRange(v)} /></label>
    </div>
  );
}

function SelectFixture() {
  const [value, setValue] = React.useState('Islands Light');
  return (
    <div style={{ maxWidth: 240 }}>
      <Select value={value} onChange={setValue} options={[
        { value: 'Islands Light', label: 'Islands Light' },
        { value: 'Islands Dark', label: 'Islands Dark' },
      ]} />
    </div>
  );
}

function TagFixture() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Tag>Plain</Tag><Tag color="#3871e1">Blue text</Tag><Tag color="#c54e58">Red text</Tag><Tag status="success">Success</Tag><Tag status="error">Error</Tag><CheckableTag checked onChange={() => {}}>Checkable</CheckableTag><Tag closable onClose={() => {}}>Closable</Tag>
    </div>
  );
}

function BadgeAvatarFixture() {
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      <Badge count={3}><Avatar>NV</Avatar></Badge>
      <Badge dot><Avatar>NV</Avatar></Badge>
      <Badge status="success" text="Sẵn sàng" />
      <AvatarGroup>{['A','B','C'].map((c) => <Avatar key={c}>{c}</Avatar>)}</AvatarGroup>
    </div>
  );
}

function FeedbackFixture() {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <Alert message="Lưu thành công" type="success" showIcon />
      <Alert message="Dữ liệu chưa đồng bộ" type="warning" showIcon />
      <Progress percent={64} />
      <Spin spinning><div style={{ padding: 12 }}>Nội dung đang tải</div></Spin>
      <Skeleton active paragraph={{ rows: 2 }} />
      <Statistic title="Tổng task" value={128} />
      <Divider />
      <Result status="success" title="Hoàn tất" subTitle="Mọi thay đổi đã được lưu" />
    </div>
  );
}

function NavFixture() {
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
      <Breadcrumb items={[{ title: 'Trang chủ' }, { title: 'Task' }, { title: 'Chi tiết' }]} />
      <Pagination current={2} total={50} pageSize={10} />
      <Segmented options={['Ngày', 'Tuần', 'Tháng']} value="Tuần" onChange={() => {}} />
    </div>
  );
}

const FIXTURES: Record<string, React.ComponentType> = { button: ButtonFixture , input: InputFixture , textarea: TextareaFixture, checkbox: CheckboxFixture, radio: RadioFixture, switch: SwitchFixture, select: SelectFixture, 'date-picker': DatePickerFixture, 'time-picker': TimePickerFixture, tag: TagFixture, feedback: FeedbackFixture, nav: NavFixture };

function App() {
  const params = new URLSearchParams(location.search);
  const id = params.get('control') ?? 'button';
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  React.useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const Fixture = FIXTURES[id];
  return (
    <main data-control={id}>
      <p className="gallery-note">TaskMate · {id} · {theme}</p>
      {Fixture ? <Fixture /> : <p>Không có fixture cho {id}</p>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
