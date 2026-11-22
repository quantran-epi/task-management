import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, IconButton, SettingOutlined, SyncOutlined } from '../src/components/ui';
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

const FIXTURES: Record<string, React.ComponentType> = { button: ButtonFixture };

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
