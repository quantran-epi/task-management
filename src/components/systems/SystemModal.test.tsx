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
  gitSourceUrl: 'https://github.com/acme/web.git',
  gitOpsUrl: 'git@github.com:acme/web-gitops.git',
} as any;

const SOURCE_PLACEHOLDER = 'https://github.com/owner/repo.git';
const GITOPS_PLACEHOLDER = 'git@github.com:owner/repo.git';

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

  it('seeds both git links when editing and saves trimmed values', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SystemModal open system={subsystem} onClose={vi.fn()} onSave={onSave} />);
    const source = await screen.findByPlaceholderText(SOURCE_PLACEHOLDER);
    const gitops = await screen.findByPlaceholderText(GITOPS_PLACEHOLDER);
    await waitFor(() => expect(source).toHaveValue(subsystem.gitSourceUrl));
    expect(gitops).toHaveValue(subsystem.gitOpsUrl);

    fireEvent.change(source, { target: { value: '  https://github.com/acme/web.git  ' } });
    fireEvent.change(gitops, { target: { value: '  git@github.com:acme/web-gitops.git  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      gitSourceUrl: 'https://github.com/acme/web.git',
      gitOpsUrl: 'git@github.com:acme/web-gitops.git',
    })));
  });

  it.each(['javascript:alert(1)', 'https://user:pass@host/x', 'https://evil.com\\@github.com/x', 'ssh:///repo', '   '])(
    'rejects invalid git URL %s inline without calling onSave',
    async (badUrl) => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      render(<SystemModal open system={subsystem} onClose={vi.fn()} onSave={onSave} />);
      const source = await screen.findByPlaceholderText(SOURCE_PLACEHOLDER);
      fireEvent.change(source, { target: { value: badUrl } });
      fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await waitFor(() => expect(screen.getAllByText(/Link git phải là/).length).toBeGreaterThan(0));
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  it('sends undefined for cleared git links so the repo deletes them', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SystemModal open system={subsystem} onClose={vi.fn()} onSave={onSave} />);
    const source = await screen.findByPlaceholderText(SOURCE_PLACEHOLDER);
    const gitops = await screen.findByPlaceholderText(GITOPS_PLACEHOLDER);
    await waitFor(() => expect(source).toHaveValue(subsystem.gitSourceUrl));
    fireEvent.change(source, { target: { value: '' } });
    fireEvent.change(gitops, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      gitSourceUrl: undefined,
      gitOpsUrl: undefined,
    })));
  });

  it('keeps both git link fields visible for LOGICAL_GROUP', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const parent = { ...subsystem, id: 'parent', name: 'Parent', code: 'PARENT', type: 'LOGICAL_GROUP', parentId: null };
    render(<SystemModal open system={parent} onClose={vi.fn()} onSave={onSave} />);
    expect(await screen.findByPlaceholderText(SOURCE_PLACEHOLDER)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(GITOPS_PLACEHOLDER)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      gitSourceUrl: parent.gitSourceUrl,
      gitOpsUrl: parent.gitOpsUrl,
    })));
  });
});
