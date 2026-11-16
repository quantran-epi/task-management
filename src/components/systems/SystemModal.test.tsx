import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SystemModal } from './SystemModal';

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => undefined }));
vi.mock('../common/RemoteDirectoryBrowserModal', () => ({
  RemoteDirectoryBrowserModal: ({ onSelect }: { onSelect: (path: string) => void }) => (
    <button onClick={() => onSelect('/srv/repo with spaces')}>Pick test directory</button>
  ),
}));

const subsystem = {
  id: 'subsystem', name: 'Web app', code: 'WEB', type: 'UI',
  parentId: 'parent', sshConfigId: 'ssh', remoteRepoPath: '/srv/original',
} as any;

describe('SystemModal form bindings', () => {
  it('shows stored and picked paths, supports typing, and saves the visible path', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SystemModal open system={subsystem} onClose={vi.fn()} onSave={onSave} />);
    const path = await screen.findByPlaceholderText('VD: /data/services/smartcard-api');
    await waitFor(() => expect(path).toHaveValue('/srv/original'));
    fireEvent.click(screen.getByText('Pick test directory'));
    expect(path).toHaveValue('/srv/repo with spaces');
    fireEvent.change(path, { target: { value: '/srv/typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      remoteRepoPath: '/srv/typed', type: 'UI',
    })));
  });

  it('shows option labels for stored and selected types while saving canonical values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SystemModal open system={subsystem} onClose={vi.fn()} onSave={onSave} />);
    const type = screen.getByRole('combobox', { name: 'Loại hệ thống' });
    await waitFor(() => expect(type).toHaveValue('Frontend UI'));
    fireEvent.mouseDown(type);
    fireEvent.change(type, { target: { value: 'DB Schema' } });
    fireEvent.click(await screen.findByText('DB Schema', { selector: '.ant-select-item-option-content' }));
    expect(type).toHaveValue('DB Schema');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: 'SCHEMA' })));
  });
});
