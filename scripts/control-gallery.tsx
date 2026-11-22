import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, IconButton, Input, InputPassword, InputSearch, Textarea, SettingOutlined, SyncOutlined } from '../src/components/ui';
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

const FIXTURES: Record<string, React.ComponentType> = { button: ButtonFixture , input: InputFixture , textarea: TextareaFixture };

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
