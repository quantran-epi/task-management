import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThemeAppHolder } from '../ui';
import { SystemTable } from './SystemTable';

vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => undefined }));

const sourceUrl = 'https://github.com/acme/web.git';
const gitOpsUrl = 'git@github.com:acme/web-gitops.git';

const system = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Web app',
  code: 'WEB',
  type: 'LOGICAL_GROUP',
  parentId: null,
  gitSourceUrl: sourceUrl,
  gitOpsUrl,
  createdAt: '2026-11-28T10:00:00.000Z',
  updatedAt: '2026-11-28T10:00:00.000Z',
} as any;

function renderTable(records: any[] = [system]) {
  return render(
    <ThemeAppHolder>
      <SystemTable
        systems={records}
        onAddSubsystem={vi.fn()}
        onEditSystem={vi.fn()}
        onDeleteSystem={vi.fn()}
      />
    </ThemeAppHolder>
  );
}

describe('SystemTable git links', () => {
  it('keeps https href and renders SCP links as https href with short label', () => {
    renderTable();
    const source = screen.getByRole('link', { name: 'https://github.com/acme/web' });
    const gitops = screen.getByRole('link', { name: 'github.com/acme/web-gitops' });

    expect(source).toHaveAttribute('href', sourceUrl);
    expect(gitops).toHaveAttribute('href', 'https://github.com/acme/web-gitops.git');
    // href host phải khớp host trong label — không để label spoof trỏ đi host khác.
    const labelHost = (label: string) =>
      new URL(/^[a-z]+:\/\//i.test(label) ? label.trim() : `https://${label.trim()}`).host;
    expect(new URL(source.getAttribute('href')!).host).toBe(labelHost(source.textContent!));
    expect(new URL(gitops.getAttribute('href')!).host).toBe(labelHost(gitops.textContent!));
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>',
    'file:///srv/repo',
    '/srv/repo',
    'two words',
    '  spaced  ',
  ])('renders unsafe git value %j as plain text, never a link', (value) => {
    renderTable([{ ...system, gitSourceUrl: value, gitOpsUrl: undefined }]);
    expect(screen.queryByRole('link')).toBeNull();
    const header = screen.getByText('Link Git');
    const columnIndex = Array.from(header.parentElement?.children ?? []).indexOf(header);
    const cell = screen.getByText('Web app').closest('tr')?.children[columnIndex];
    expect(cell?.textContent).toBe(`Source: ${value}`);
  });
});
