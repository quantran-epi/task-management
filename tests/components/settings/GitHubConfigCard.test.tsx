import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import { GitHubAuthProvider, useGitHubAuth } from '../../../src/context/GitHubAuthContext';
import { GitHubConfigCard } from '../../../src/components/settings/GitHubConfigCard';

function TestHarness({ db }: { db: TaskPlannerDatabase }) {
  const { token, passphrase } = useGitHubAuth();

  return (
    <div>
      <GitHubConfigCard db={db} />
      <div data-testid="context-token">{token ?? 'NONE'}</div>
      <div data-testid="context-passphrase">{passphrase ?? 'NONE'}</div>
    </div>
  );
}

describe('GitHubConfigCard', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-github-config-${Date.now()}`);
    await db.open();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders all repository target and credential input fields', () => {
    render(
      <GitHubAuthProvider>
        <TestHarness db={db} />
      </GitHubAuthProvider>
    );

    expect(screen.getByLabelText(/Chủ sở hữu hoặc tổ chức/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên kho lưu trữ GitHub/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nhánh kho lưu trữ GitHub/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/GitHub Personal Access Token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mật khẩu mã hóa/i)).toBeInTheDocument();
  });

  it('loads existing repository settings from IndexedDB', async () => {
    await db.settings.put({ key: 'github_owner', value: 'octocat' });
    await db.settings.put({ key: 'github_repo', value: 'my-tasks' });
    await db.settings.put({ key: 'github_branch', value: 'develop' });

    render(
      <GitHubAuthProvider>
        <TestHarness db={db} />
      </GitHubAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Chủ sở hữu hoặc tổ chức/i)).toHaveValue('octocat');
      expect(screen.getByLabelText(/Tên kho lưu trữ GitHub/i)).toHaveValue('my-tasks');
      expect(screen.getByLabelText(/Nhánh kho lưu trữ GitHub/i)).toHaveValue('develop');
    });
  });

  it('persists owner, repo, and branch to db.settings without persisting secrets', async () => {
    render(
      <GitHubAuthProvider>
        <TestHarness db={db} />
      </GitHubAuthProvider>
    );

    const ownerInput = screen.getByLabelText(/Chủ sở hữu hoặc tổ chức/i);
    const repoInput = screen.getByLabelText(/Tên kho lưu trữ GitHub/i);
    const branchInput = screen.getByLabelText(/Nhánh kho lưu trữ GitHub/i);
    const tokenInput = screen.getByLabelText(/GitHub Personal Access Token/i);
    const passInput = screen.getByLabelText(/Mật khẩu mã hóa/i);

    fireEvent.change(ownerInput, { target: { value: 'alice-dev' } });
    fireEvent.change(repoInput, { target: { value: 'planner-backup' } });
    fireEvent.change(branchInput, { target: { value: 'release' } });
    fireEvent.change(tokenInput, { target: { value: 'github_pat_secret_999' } });
    fireEvent.change(passInput, { target: { value: 'strong-passphrase-888' } });

    const saveButton = screen.getByRole('button', { name: /Lưu cấu hình kho lưu trữ/i });
    fireEvent.click(saveButton);

    await waitFor(async () => {
      const savedOwner = await db.settings.get('github_owner');
      expect(savedOwner?.value).toBe('alice-dev');
      const savedRepo = await db.settings.get('github_repo');
      expect(savedRepo?.value).toBe('planner-backup');
      const savedBranch = await db.settings.get('github_branch');
      expect(savedBranch?.value).toBe('release');
    });

    // Verify token and passphrase are NEVER stored in db.settings
    const allSettings = await db.settings.toArray();
    const keys = allSettings.map((s) => s.key);
    expect(keys).not.toContain('github_token');
    expect(keys).not.toContain('github_pat');
    expect(keys).not.toContain('passphrase');
    expect(keys).not.toContain('encryption_passphrase');

    for (const item of allSettings) {
      const valStr = JSON.stringify(item.value);
      expect(valStr).not.toContain('github_pat_secret_999');
      expect(valStr).not.toContain('strong-passphrase-888');
    }

    // Verify secrets are held strictly in memory context
    expect(screen.getByTestId('context-token').textContent).toBe('github_pat_secret_999');
    expect(screen.getByTestId('context-passphrase').textContent).toBe('strong-passphrase-888');
  });

  it('purges secrets from memory and resets input values when clicking Clear Session', async () => {
    render(
      <GitHubAuthProvider>
        <TestHarness db={db} />
      </GitHubAuthProvider>
    );

    const tokenInput = screen.getByLabelText(/GitHub Personal Access Token/i);
    const passInput = screen.getByLabelText(/Mật khẩu mã hóa/i);

    fireEvent.change(tokenInput, { target: { value: 'secret_token_123' } });
    fireEvent.change(passInput, { target: { value: 'secret_pass_123' } });

    expect(screen.getByTestId('context-token').textContent).toBe('secret_token_123');
    expect(screen.getByTestId('context-passphrase').textContent).toBe('secret_pass_123');

    const clearButton = screen.getByRole('button', { name: /Xóa phiên kết nối/i });
    fireEvent.click(clearButton);

    expect(screen.getByTestId('context-token').textContent).toBe('NONE');
    expect(screen.getByTestId('context-passphrase').textContent).toBe('NONE');
    expect(tokenInput).toHaveValue('');
    expect(passInput).toHaveValue('');
  });
});
