import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GitHubAuthProvider, useGitHubAuth } from '../../src/context/GitHubAuthContext';

function TestConsumer() {
  const {
    token,
    passphrase,
    hasToken,
    hasPassphrase,
    setCredentials,
    setPassphrase,
    clearSession,
  } = useGitHubAuth();

  return (
    <div>
      <div data-testid="token">{token ?? 'NULL'}</div>
      <div data-testid="passphrase">{passphrase ?? 'NULL'}</div>
      <div data-testid="hasToken">{hasToken ? 'TRUE' : 'FALSE'}</div>
      <div data-testid="hasPassphrase">{hasPassphrase ? 'TRUE' : 'FALSE'}</div>
      <button onClick={() => setCredentials('github_pat_123', 'passphrase_abc')}>
        Set All
      </button>
      <button onClick={() => setCredentials('github_pat_xyz')}>
        Set Token Only
      </button>
      <button onClick={() => setPassphrase('new_passphrase_456')}>
        Set Passphrase Only
      </button>
      <button onClick={clearSession}>Clear Session</button>
    </div>
  );
}

describe('GitHubAuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('initializes with token: null and passphrase: null', () => {
    render(
      <GitHubAuthProvider>
        <TestConsumer />
      </GitHubAuthProvider>
    );

    expect(screen.getByTestId('token').textContent).toBe('NULL');
    expect(screen.getByTestId('passphrase').textContent).toBe('NULL');
    expect(screen.getByTestId('hasToken').textContent).toBe('FALSE');
    expect(screen.getByTestId('hasPassphrase').textContent).toBe('FALSE');
  });

  it('stores token and passphrase in memory without writing to storage', () => {
    const localSetItem = vi.spyOn(Storage.prototype, 'setItem');

    render(
      <GitHubAuthProvider>
        <TestConsumer />
      </GitHubAuthProvider>
    );

    act(() => {
      screen.getByText('Set All').click();
    });

    expect(screen.getByTestId('token').textContent).toBe('github_pat_123');
    expect(screen.getByTestId('passphrase').textContent).toBe('passphrase_abc');
    expect(screen.getByTestId('hasToken').textContent).toBe('TRUE');
    expect(screen.getByTestId('hasPassphrase').textContent).toBe('TRUE');

    // Verify zero calls to localStorage / sessionStorage
    expect(localSetItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    localSetItem.mockRestore();
  });

  it('updates passphrase independently via setPassphrase', () => {
    render(
      <GitHubAuthProvider>
        <TestConsumer />
      </GitHubAuthProvider>
    );

    act(() => {
      screen.getByText('Set Token Only').click();
    });
    expect(screen.getByTestId('token').textContent).toBe('github_pat_xyz');
    expect(screen.getByTestId('passphrase').textContent).toBe('NULL');

    act(() => {
      screen.getByText('Set Passphrase Only').click();
    });
    expect(screen.getByTestId('token').textContent).toBe('github_pat_xyz');
    expect(screen.getByTestId('passphrase').textContent).toBe('new_passphrase_456');
    expect(screen.getByTestId('hasPassphrase').textContent).toBe('TRUE');
  });

  it('resets both token and passphrase to null on clearSession', () => {
    render(
      <GitHubAuthProvider>
        <TestConsumer />
      </GitHubAuthProvider>
    );

    act(() => {
      screen.getByText('Set All').click();
    });
    expect(screen.getByTestId('token').textContent).toBe('github_pat_123');

    act(() => {
      screen.getByText('Clear Session').click();
    });

    expect(screen.getByTestId('token').textContent).toBe('NULL');
    expect(screen.getByTestId('passphrase').textContent).toBe('NULL');
    expect(screen.getByTestId('hasToken').textContent).toBe('FALSE');
    expect(screen.getByTestId('hasPassphrase').textContent).toBe('FALSE');
  });

  it('returns fallback defaults when used outside GitHubAuthProvider without throwing', () => {
    render(<TestConsumer />);

    expect(screen.getByTestId('token').textContent).toBe('NULL');
    expect(screen.getByTestId('passphrase').textContent).toBe('NULL');
    expect(screen.getByTestId('hasToken').textContent).toBe('FALSE');
    expect(screen.getByTestId('hasPassphrase').textContent).toBe('FALSE');
  });
});
